console.log('packer.worker.ts script started.');

// Define interfaces inline
interface Position {
  x: number;
  y: number;
  z: number;
}

interface Container {
  id: string;
  name: string;
  length: number;
  width: number;
  height: number;
  maxWeight: number;
}

interface CargoItem {
  id: string;
  name: string;
  length: number;
  width: number;
  height: number;
  weight: number;
  color: string;
  quantity: number;
}

interface PackedItem extends CargoItem {
  position: Position;
  rotation: {
    x: number;
    y: number;
    z: number;
  };
  color: string;
}

interface PackedResult {
  packedItems: PackedItem[];
  unpackedItems: CargoItem[];
  containerFillPercentage: number;
  weightCapacityPercentage: number;
  totalWeight: number;
}

// --- Start: Functions moved from binPacking.ts ---

const getRandomColor = (): string => {
  const letters = '0123456789ABCDEF';
  let color = '#';
  for (let i = 0; i < 6; i++) {
    color += letters[Math.floor(Math.random() * 16)];
  }
  return color;
};

interface Rotation {
  x: number;
  y: number;
  z: number;
  length: number;
  width: number;
  height: number;
}

const getPossibleRotations = (item: CargoItem): Rotation[] => {
  // Implement all 6 possible orientations of a 3D box
  return [
    // Original orientation
    { x: 0, y: 0, z: 0, length: item.length, width: item.width, height: item.height },
    
    // Rotate 90° around Y-axis (width and length swap)
    { x: 0, y: 90, z: 0, length: item.width, width: item.length, height: item.height },
    
    // Rotate 90° around X-axis (height and width swap)
    { x: 90, y: 0, z: 0, length: item.length, width: item.height, height: item.width },
    
    // Rotate 90° around Z-axis (height and length swap)
    { x: 0, y: 0, z: 90, length: item.height, width: item.width, height: item.length },
    
    // Rotate 90° around X-axis and 90° around Y-axis
    { x: 90, y: 90, z: 0, length: item.width, width: item.height, height: item.length },
    
    // Rotate 90° around Y-axis and 90° around Z-axis
    { x: 0, y: 90, z: 90, length: item.height, width: item.length, height: item.width }
  ];
};

const isPositionEmpty = (
  position: Position,
  rotation: Rotation,
  packedItems: PackedItem[],
  container: Container
): boolean => {
  // Calculate the end coordinates based on the provided rotation
  const endX = position.x + rotation.length;
  const endY = position.y + rotation.height;
  const endZ = position.z + rotation.width;

  // First check if the item is strictly within container boundaries
  // No tolerance for boundary violations to ensure items stay inside
  if (
    position.x < 0 || endX > container.length ||
    position.y < 0 || endY > container.height ||
    position.z < 0 || endZ > container.width
  ) {
    // Log the violation for debugging
    console.log('Boundary violation:', {
      start: position,
      end: { x: endX, y: endY, z: endZ },
      containerDims: container
    });
    return false;
  }

  // Check collision with existing items using a small safety margin
  // to prevent floating point errors causing overlaps
  const SAFETY_MARGIN = 0.01; // 1cm safety margin
  
  for (const packedItem of packedItems) {
    // Get the actual dimensions based on the rotation of the packed item
    let itemLength, itemWidth, itemHeight;
    
    // Determine the actual dimensions based on rotation
    if (packedItem.rotation.y === 90) {
      // Width and length are swapped when rotated 90 degrees on Y axis
      itemLength = packedItem.width;
      itemWidth = packedItem.length;
      itemHeight = packedItem.height;
    } else if (packedItem.rotation.x === 90) {
      // Height and width are swapped when rotated 90 degrees on X axis
      itemLength = packedItem.length;
      itemWidth = packedItem.height;
      itemHeight = packedItem.width;
    } else if (packedItem.rotation.z === 90) {
      // Height and length are swapped when rotated 90 degrees on Z axis
      itemLength = packedItem.height;
      itemWidth = packedItem.width;
      itemHeight = packedItem.length;
    } else if (packedItem.rotation.x === 90 && packedItem.rotation.y === 90) {
      // Combined rotation around X and Y axes
      itemLength = packedItem.width;
      itemWidth = packedItem.height;
      itemHeight = packedItem.length;
    } else if (packedItem.rotation.y === 90 && packedItem.rotation.z === 90) {
      // Combined rotation around Y and Z axes
      itemLength = packedItem.height;
      itemWidth = packedItem.length;
      itemHeight = packedItem.width;
    } else {
      // No rotation or other rotations
      itemLength = packedItem.length;
      itemWidth = packedItem.width;
      itemHeight = packedItem.height;
    }
    
    // Calculate the end coordinates of the packed item
    const itemEndX = packedItem.position.x + itemLength;
    const itemEndY = packedItem.position.y + itemHeight;
    const itemEndZ = packedItem.position.z + itemWidth;

    // Check for overlap in all three dimensions with safety margin
    // Two boxes overlap if they overlap in all three dimensions
    if (
      // Check X-axis overlap (with safety margin)
      position.x + SAFETY_MARGIN < itemEndX && 
      endX - SAFETY_MARGIN > packedItem.position.x &&
      // Check Y-axis overlap (with safety margin)
      position.y + SAFETY_MARGIN < itemEndY && 
      endY - SAFETY_MARGIN > packedItem.position.y &&
      // Check Z-axis overlap (with safety margin)
      position.z + SAFETY_MARGIN < itemEndZ && 
      endZ - SAFETY_MARGIN > packedItem.position.z
    ) {
      // Log collision for debugging
      console.log('Collision detected between items:', {
        newItem: {
          position,
          dimensions: { length: rotation.length, width: rotation.width, height: rotation.height }
        },
        existingItem: {
          position: packedItem.position,
          dimensions: { length: itemLength, width: itemWidth, height: itemHeight }
        }
      });
      return false;
    }
  }

  return true;
};

// This function has been removed as it's no longer used
// The packing algorithm now uses a simpler distance-from-origin approach

// This function has been removed as it's no longer used
// The packing algorithm now uses a simpler distance-from-origin approach
// which prioritizes packing items from the bottom-front-left corner

// Find the best position for an item considering industry best practices
const findBestPosition = (
  item: CargoItem,
  packedItems: PackedItem[],
  container: Container
): { position: Position; rotation: Rotation } | null => {
  // Get all possible rotations for this item
  const rotations = getPossibleRotations(item);
  // Use a smaller step size for more precise packing
  const step = 1; // Use smallest step size for precise packing and to avoid overlaps
  
  let bestPosition: Position | null = null;
  let bestRotation: Rotation | null = null;
  let bestScore = Infinity;

  // Always prioritize positions closer to the origin (bottom-front-left corner)
  // Try each rotation to find the best fit
  for (const rotation of rotations) {
    // Make sure we don't try positions that would exceed container dimensions
    const maxX = Math.max(0, container.length - rotation.length);
    const maxY = Math.max(0, container.height - rotation.height);
    const maxZ = Math.max(0, container.width - rotation.width);
    
    // Skip this rotation if it can't fit in the container
    if (maxX < 0 || maxY < 0 || maxZ < 0) {
      continue;
    }

    // Start from the origin (bottom-front-left corner) and work outward
    // First try to place items on the floor
    for (let x = 0; x <= maxX; x += step) {
      for (let z = 0; z <= maxZ; z += step) {
        // Always start from the bottom (y=0) for stability
        let y = 0;
        
        // Check if there are any items below this position
        // If so, place this item on top of the highest one
        for (const packedItem of packedItems) {
          // Get actual dimensions based on rotation
          let itemLength, itemWidth, itemHeight;
          
          // Determine the actual dimensions based on rotation
          if (packedItem.rotation.y === 90) {
            itemLength = packedItem.width;
            itemWidth = packedItem.length;
            itemHeight = packedItem.height;
          } else if (packedItem.rotation.x === 90) {
            itemLength = packedItem.length;
            itemWidth = packedItem.height;
            itemHeight = packedItem.width;
          } else if (packedItem.rotation.z === 90) {
            itemLength = packedItem.height;
            itemWidth = packedItem.width;
            itemHeight = packedItem.length;
          } else if (packedItem.rotation.x === 90 && packedItem.rotation.y === 90) {
            itemLength = packedItem.width;
            itemWidth = packedItem.height;
            itemHeight = packedItem.length;
          } else if (packedItem.rotation.y === 90 && packedItem.rotation.z === 90) {
            itemLength = packedItem.height;
            itemWidth = packedItem.length;
            itemHeight = packedItem.width;
          } else {
            itemLength = packedItem.length;
            itemWidth = packedItem.width;
            itemHeight = packedItem.height;
          }
          
          // Check if this item is directly below our current position
          // We need a precise overlap check to avoid items floating in air
          if (x < packedItem.position.x + itemLength && 
              x + rotation.length > packedItem.position.x &&
              z < packedItem.position.z + itemWidth && 
              z + rotation.width > packedItem.position.z) {
            // If there's an item below, stack on top of it
            y = Math.max(y, packedItem.position.y + itemHeight);
          }
        }

        // Double-check that the item fits within container height
        if (y + rotation.height <= container.height) {
          const position = { x, y, z };
          
          // Verify there's no collision with other items
          if (isPositionEmpty(position, rotation, packedItems, container)) {
            // Calculate score based on proximity to origin and stability
            // Lower score is better - prioritize positions closer to origin
            // This prioritizes packing from the bottom-front-left corner
            const distanceFromOrigin = x + y + z;
            const score = distanceFromOrigin;
            
            if (score < bestScore) {
              bestScore = score;
              bestPosition = position;
              bestRotation = rotation;
            }
          }
        }
      }
    }
  }

  // If we found a position, return it
  if (bestPosition && bestRotation) {
    return { position: bestPosition, rotation: bestRotation };
  }
  
  // If we couldn't find a position with the above strategy, try a more exhaustive search
  // Use a slightly larger step size for this search
  const largerStep = 2;
  
  for (const rotation of rotations) {
    // Make sure we don't try positions that would exceed container dimensions
    const maxX = Math.max(0, container.length - rotation.length);
    const maxY = Math.max(0, container.height - rotation.height);
    const maxZ = Math.max(0, container.width - rotation.width);
    
    // Skip this rotation if it can't fit in the container
    if (maxX < 0 || maxY < 0 || maxZ < 0) {
      continue;
    }
    
    // Try positions throughout the container, starting from the bottom
    for (let y = 0; y <= maxY; y += largerStep) {
      for (let x = 0; x <= maxX; x += largerStep) {
        for (let z = 0; z <= maxZ; z += largerStep) {
          const position = { x, y, z };
          
          if (isPositionEmpty(position, rotation, packedItems, container)) {
            return { position, rotation };
          }
        }
      }
    }
  }
  
  // If we still couldn't find a position, try one last attempt with the original dimensions
  // This is a fallback for when rotations might be causing issues
  const originalRotation = { x: 0, y: 0, z: 0, length: item.length, width: item.width, height: item.height };
  const maxX = Math.max(0, container.length - originalRotation.length);
  const maxY = Math.max(0, container.height - originalRotation.height);
  const maxZ = Math.max(0, container.width - originalRotation.width);
  
  // Skip if it can't fit in the container
  if (maxX >= 0 && maxY >= 0 && maxZ >= 0) {
    for (let y = 0; y <= maxY; y += largerStep) {
      for (let x = 0; x <= maxX; x += largerStep) {
        for (let z = 0; z <= maxZ; z += largerStep) {
          const position = { x, y, z };
          
          if (isPositionEmpty(position, originalRotation, packedItems, container)) {
            return { position, rotation: originalRotation };
          }
        }
      }
    }
  }
  
  return null;
};

// Industry standard packing strategies
const PACKING_STRATEGIES = {
  LARGEST_VOLUME_FIRST: 'LARGEST_VOLUME_FIRST',
  HEAVIEST_FIRST: 'HEAVIEST_FIRST',
  MOST_CONSTRAINED_FIRST: 'MOST_CONSTRAINED_FIRST',
  WALL_BUILDING: 'WALL_BUILDING'
};

// Sort items based on the selected strategy
const sortItemsByStrategy = (items: CargoItem[], strategy: string): CargoItem[] => {
  const itemsCopy = [...items];
  
  switch (strategy) {
    case PACKING_STRATEGIES.LARGEST_VOLUME_FIRST:
      return itemsCopy.sort((a, b) => 
        (b.length * b.width * b.height) - (a.length * a.width * a.height)
      );
      
    case PACKING_STRATEGIES.HEAVIEST_FIRST:
      return itemsCopy.sort((a, b) => b.weight - a.weight);
      
    case PACKING_STRATEGIES.MOST_CONSTRAINED_FIRST:
      // Sort by the minimum of length, width, height (most constrained dimension)
      return itemsCopy.sort((a, b) => {
        const aMin = Math.min(a.length, a.width, a.height);
        const bMin = Math.min(b.length, b.width, b.height);
        return bMin - aMin;
      });
      
    case PACKING_STRATEGIES.WALL_BUILDING:
      // Sort by height (to build walls from the bottom up)
      return itemsCopy.sort((a, b) => b.height - a.height);
      
    default:
      return itemsCopy;
  }
};

// Try to pack an individual item
const tryPackItem = (
  item: CargoItem, 
  packedItems: PackedItem[], 
  container: Container, 
  totalWeight: number
): { packedItem: PackedItem | null; success: boolean } => {
  if (totalWeight + item.weight > container.maxWeight) {
    console.log('Item exceeds weight limit:', {
      itemWeight: item.weight,
      currentTotal: totalWeight,
      maxWeight: container.maxWeight
    });
    return { packedItem: null, success: false };
  }

  const result = findBestPosition(item, packedItems, container);
  
  if (result) {
    const packedItem = {
      ...item,
      position: result.position,
      rotation: result.rotation,
      // Use the user-provided color instead of generating a random one
      color: item.color || getRandomColor(), // Fallback to random color if none provided
    };
    return { packedItem, success: true };
  }
  
  return { packedItem: null, success: false };
};

// Main packing algorithm with multiple strategies and retries
const packItems = (items: CargoItem[], container: Container): PackedResult => {
  console.log('Starting packing algorithm with:', {
    itemCount: items.length,
    container
  });

  // Expand items based on quantity
  const expandedItems: CargoItem[] = [];
  items.forEach(item => {
    const quantity = item.quantity || 1; // Default to 1 if quantity is not specified
    
    for (let i = 0; i < quantity; i++) {
      // Create a copy of the item with a unique ID for each instance
      expandedItems.push({
        ...item,
        id: `${item.id}-${i}`, // Ensure each copy has a unique ID
      });
    }
  });
  
  console.log(`Expanded ${items.length} items to ${expandedItems.length} items based on quantity`);

  // Try different packing strategies to maximize container utilization
  const strategies = [
    PACKING_STRATEGIES.LARGEST_VOLUME_FIRST,
    PACKING_STRATEGIES.WALL_BUILDING,
    PACKING_STRATEGIES.HEAVIEST_FIRST,
    PACKING_STRATEGIES.MOST_CONSTRAINED_FIRST
  ];
  
  let bestResult: PackedResult | null = null;
  let bestUtilization = 0;
  
  // Try each strategy and keep the best result
  for (const strategy of strategies) {
    console.log(`Trying packing strategy: ${strategy}`);
    
    const packedItems: PackedItem[] = [];
    const unpackedItems: CargoItem[] = [];
    let totalWeight = 0;

    // Sort items according to the current strategy
    const sortedItems = sortItemsByStrategy(expandedItems, strategy);
    
    // First pass: try to pack all items
    for (const item of sortedItems) {
      console.log(`Processing item with strategy ${strategy}:`, item);
      
      const { packedItem, success } = tryPackItem(item, packedItems, container, totalWeight);
      
      if (success && packedItem) {
        packedItems.push(packedItem);
        totalWeight += item.weight;
      } else {
        unpackedItems.push(item);
      }
    }
    
    // Second pass: try to pack remaining items with different orientations
    // This implements the industry practice of trying different arrangements
    if (unpackedItems.length > 0) {
      console.log(`Second pass for ${unpackedItems.length} unpacked items with strategy ${strategy}`);
      
      const stillUnpacked: CargoItem[] = [];
      
      for (const item of unpackedItems) {
        const { packedItem, success } = tryPackItem(item, packedItems, container, totalWeight);
        
        if (success && packedItem) {
          packedItems.push(packedItem);
          totalWeight += item.weight;
        } else {
          stillUnpacked.push(item);
        }
      }
      
      // Update the unpacked items list
      unpackedItems.length = 0;
      unpackedItems.push(...stillUnpacked);
    }
    
    // Calculate utilization metrics
    const containerVolume = container.length * container.width * container.height;
    const packedVolume = packedItems.reduce((sum, item) => 
      sum + (item.length * item.width * item.height), 0);
    
    const containerFillPercentage = (packedVolume / containerVolume) * 100;
    const weightCapacityPercentage = (totalWeight / container.maxWeight) * 100;
    
    console.log(`Strategy ${strategy} results:`, {
      packedItems: packedItems.length,
      unpackedItems: unpackedItems.length,
      containerFillPercentage,
      weightCapacityPercentage
    });
    
    // Check if this strategy gave better results
    // We prioritize: 1) Number of packed items, 2) Space utilization
    const currentUtilization = packedItems.length * 1000 + containerFillPercentage;
    
    if (currentUtilization > bestUtilization) {
      bestUtilization = currentUtilization;
      bestResult = {
        packedItems,
        unpackedItems,
        containerFillPercentage,
        weightCapacityPercentage,
        totalWeight
      };
    }
  }
  
  // If we couldn't pack any items with any strategy (unlikely), return empty result
  if (!bestResult) {
    return {
      packedItems: [],
      unpackedItems: items,
      containerFillPercentage: 0,
      weightCapacityPercentage: 0,
      totalWeight: 0
    };
  }
  
  console.log('Best packing result:', bestResult);
  return bestResult;
};

// Worker message handler
console.log('Setting up worker message handler');

self.onmessage = (event) => {
  console.log('Worker received message:', event.data);
  
  try {
    const { items, container } = event.data;
    
    if (!items || !container) {
      throw new Error('Missing required data: items or container');
    }
    
    // Count total items including quantities
    const totalItemCount = items.reduce((total: number, item: CargoItem) => total + (item.quantity || 1), 0);
    
    console.log('Worker starting packing algorithm with:', {
      uniqueItemCount: items.length,
      totalItemCount: totalItemCount,
      containerDimensions: `${container.length}x${container.width}x${container.height}`
    });
    
    const result = packItems(items, container);
    
    // Consolidate unpacked items by grouping them back by their original ID
    const consolidatedUnpacked: { [key: string]: CargoItem & { quantity: number } } = {};
    
    result.unpackedItems.forEach(item => {
      // Extract the original item ID (remove the -0, -1, etc. suffix)
      const originalId = item.id.split('-')[0];
      
      if (consolidatedUnpacked[originalId]) {
        consolidatedUnpacked[originalId].quantity += 1;
      } else {
        // Find the original item to get its properties
        const originalItem = items.find((i: CargoItem) => i.id === originalId);
        if (originalItem) {
          consolidatedUnpacked[originalId] = {
            ...originalItem,
            quantity: 1
          };
        }
      }
    });
    
    // Replace the unpacked items with the consolidated list
    result.unpackedItems = Object.values(consolidatedUnpacked);
    
    console.log('Worker completed packing algorithm with result:', {
      packedItems: result.packedItems.length,
      unpackedItems: result.unpackedItems.length,
      fillPercentage: result.containerFillPercentage.toFixed(2) + '%'
    });
    
    self.postMessage(result);
  } catch (error: unknown) {
    console.error('Worker encountered an error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    self.postMessage({ error: errorMessage });
  }
};

console.log('Worker script initialization complete');