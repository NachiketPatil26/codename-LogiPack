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

interface ItemConstraint {
  type: string;
  value?: number; // For weight-related constraints
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
  constraints?: ItemConstraint[];
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
  // Check if the item must be upright (non-rotatable)
  const mustBeUpright = item.constraints?.some(c => c.type === CONSTRAINT_TYPES.MUST_BE_UPRIGHT);
  
  if (mustBeUpright) {
    console.log(`Item ${item.id} must be upright - limiting rotations`);
    // Only allow rotations that keep the item upright (y-axis rotations)
    return [
      // Original orientation
      { x: 0, y: 0, z: 0, length: item.length, width: item.width, height: item.height },
      
      // Rotate 90° around Y-axis (width and length swap)
      { x: 0, y: 90, z: 0, length: item.width, width: item.length, height: item.height },
    ];
  }
  
  // For rotatable items, implement all 6 possible orientations of a 3D box
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
  container: Container,
  alternativeRotation: boolean = false
): { position: Position; rotation: Rotation } | null => {
  // Get all possible rotations for this item
  let rotations = getPossibleRotations(item);
  
  // If using alternative rotation strategy, reverse the order to try different orientations first
  if (alternativeRotation) {
    rotations = [...rotations].reverse();
  }
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

// Constraint types
const CONSTRAINT_TYPES = {
  MUST_BE_ON_TOP: 'MUST_BE_ON_TOP',
  MUST_BE_ON_BOTTOM: 'MUST_BE_ON_BOTTOM',
  MUST_BE_UPRIGHT: 'MUST_BE_UPRIGHT',
  CAN_SUPPORT_WEIGHT: 'CAN_SUPPORT_WEIGHT',
  FRAGILE: 'FRAGILE'
};

// Industry standard packing strategies
const PACKING_STRATEGIES = {
  LARGEST_VOLUME_FIRST: 'LARGEST_VOLUME_FIRST',
  HEAVIEST_FIRST: 'HEAVIEST_FIRST',
  MOST_CONSTRAINED_FIRST: 'MOST_CONSTRAINED_FIRST',
  WALL_BUILDING: 'WALL_BUILDING',
  FRAGILE_ITEMS_LAST: 'FRAGILE_ITEMS_LAST'
};

// Check if an item is fragile
const isFragile = (item: CargoItem): boolean => {
  return item.constraints?.some(c => c.type === CONSTRAINT_TYPES.FRAGILE) || false;
};

// Check if an item must be upright (non-rotatable)
const mustBeUpright = (item: CargoItem): boolean => {
  return item.constraints?.some(c => c.type === CONSTRAINT_TYPES.MUST_BE_UPRIGHT) || false;
};

// Count constraints on an item
const countConstraints = (item: CargoItem): number => {
  return item.constraints?.length || 0;
};

// Sort items based on the selected strategy
const sortItemsByStrategy = (items: CargoItem[], strategy: string): CargoItem[] => {
  const itemsCopy = [...items];
  
  switch (strategy) {
    case PACKING_STRATEGIES.LARGEST_VOLUME_FIRST:
      return itemsCopy.sort((a, b) => {
        // First sort by fragility (non-fragile first)
        if (isFragile(a) !== isFragile(b)) {
          return isFragile(a) ? 1 : -1; // Non-fragile items first
        }
        // Then by volume
        return (b.length * b.width * b.height) - (a.length * a.width * a.height);
      });
      
    case PACKING_STRATEGIES.HEAVIEST_FIRST:
      return itemsCopy.sort((a, b) => {
        // First sort by fragility (non-fragile first)
        if (isFragile(a) !== isFragile(b)) {
          return isFragile(a) ? 1 : -1; // Non-fragile items first
        }
        // Then by weight
        return b.weight - a.weight;
      });
      
    case PACKING_STRATEGIES.MOST_CONSTRAINED_FIRST:
      return itemsCopy.sort((a, b) => {
        // First sort by number of constraints
        const aConstraints = countConstraints(a);
        const bConstraints = countConstraints(b);
        if (aConstraints !== bConstraints) {
          return bConstraints - aConstraints; // More constrained first
        }
        // Then by the minimum dimension
        const aMin = Math.min(a.length, a.width, a.height);
        const bMin = Math.min(b.length, b.width, b.height);
        return bMin - aMin;
      });
      
    case PACKING_STRATEGIES.WALL_BUILDING:
      return itemsCopy.sort((a, b) => {
        // First sort by fragility (non-fragile first)
        if (isFragile(a) !== isFragile(b)) {
          return isFragile(a) ? 1 : -1; // Non-fragile items first
        }
        // Then by height for wall building
        return b.height - a.height;
      });
      
    case PACKING_STRATEGIES.FRAGILE_ITEMS_LAST:
      return itemsCopy.sort((a, b) => {
        // Sort by fragility
        if (isFragile(a) !== isFragile(b)) {
          return isFragile(a) ? 1 : -1; // Non-fragile items first
        }
        // Then by volume for similar items
        return (b.length * b.width * b.height) - (a.length * a.width * a.height);
      });
      
    default:
      return itemsCopy;
  }
};

// Try to pack an individual item
const tryPackItem = (
  item: CargoItem, 
  packedItems: PackedItem[], 
  container: Container, 
  totalWeight: number,
  alternativeRotation: boolean = false
): { packedItem: PackedItem | null; success: boolean } => {
  // Check weight limit
  if (totalWeight + item.weight > container.maxWeight) {
    console.log('Item exceeds weight limit:', {
      itemWeight: item.weight,
      currentTotal: totalWeight,
      maxWeight: container.maxWeight
    });
    return { packedItem: null, success: false };
  }

  // Log if item has constraints
  if (item.constraints && item.constraints.length > 0) {
    console.log(`Item ${item.id} has constraints:`, item.constraints);
  }

  const result = findBestPosition(item, packedItems, container, alternativeRotation);
  
  if (result) {
    // For fragile items, verify that no items will be placed on top
    if (isFragile(item) && !isValidForFragileItem(result.position, result.rotation, packedItems)) {
      console.log(`Cannot place fragile item ${item.id} at position:`, result.position);
      return { packedItem: null, success: false };
    }
    
    const packedItem = {
      ...item,
      position: result.position,
      rotation: result.rotation,
      // Use the user-provided color instead of generating a random one
      color: item.color || getRandomColor(), // Fallback to random color if none provided
    };
    
    console.log(`Successfully packed item ${item.id}`, {
      position: result.position,
      rotation: result.rotation,
      isFragile: isFragile(item),
      mustBeUpright: mustBeUpright(item)
    });
    
    return { packedItem, success: true };
  }
  
  console.log(`Failed to find position for item ${item.id}`);
  return { packedItem: null, success: false };
};

// Check if a position is valid for a fragile item (nothing on top)
const isValidForFragileItem = (
  position: Position,
  rotation: Rotation,
  packedItems: PackedItem[]
): boolean => {
  // For fragile items, we need to ensure no items are placed on top
  const itemTop = position.y + rotation.height;
  
  // Check if any packed item is above this item
  for (const packedItem of packedItems) {
    // Skip if the item is not above our position
    if (packedItem.position.y <= itemTop) continue;
    
    // Check if the items overlap in the X-Z plane
    const itemEndX = position.x + rotation.length;
    const itemEndZ = position.z + rotation.width;
    
    const packedEndX = packedItem.position.x + packedItem.length;
    const packedEndZ = packedItem.position.z + packedItem.width;
    
    // If there's overlap in both X and Z axes, the item is above our fragile item
    if (
      position.x < packedEndX && itemEndX > packedItem.position.x &&
      position.z < packedEndZ && itemEndZ > packedItem.position.z
    ) {
      console.log('Cannot place fragile item here - would have items on top');
      return false;
    }
  }
  
  return true;
};
const packItems = (items: CargoItem[], container: Container): PackedResult => {
  console.log('Starting packing algorithm with:', { items, container });
  
  // Expand items based on quantity
  const expandedItems: CargoItem[] = [];
  items.forEach(item => {
    for (let i = 0; i < item.quantity; i++) {
      expandedItems.push({
        ...item,
        id: `${item.id}-${i}`,
        quantity: 1 // Set quantity to 1 for each expanded item
      });
    }
  });
  
  console.log(`Expanded ${items.length} items to ${expandedItems.length} items based on quantity`);
  
  // Initialize tracking variables
  const packedItems: PackedItem[] = [];
  const unpackedItems: CargoItem[] = [];
  let totalVolumePacked = 0;
  let totalWeight = 0;
  const containerVolume = container.length * container.width * container.height;
  
  // Variables to track the best packing result
  let bestResult: PackedResult | null = null;
  let bestUtilization = 0;
  
  // Try different packing strategies
  const strategies = [
    'LARGEST_VOLUME_FIRST',
    'HEAVIEST_FIRST',
    'MOST_CONSTRAINED_FIRST'
  ];
  
  // Maximum number of retries for failed items
  const MAX_RETRIES = 2;
  
  // Try each strategy until we find one that works well
  for (const strategy of strategies) {
    console.log(`Trying packing strategy: ${strategy}`);
    
    // Sort items according to the current strategy
    const sortedItems = sortItemsByStrategy([...expandedItems], strategy);
    
    // Keep track of items that failed to pack for retrying
    let failedItems: CargoItem[] = [];
    let retryCount = 0;
    
    // Try to pack each item
    for (let i = 0; i < sortedItems.length; i++) {
      const item = sortedItems[i];
      console.log(`Processing item with strategy ${strategy}:`, item);
      
      const { packedItem, success } = tryPackItem(
        item, 
        packedItems, 
        container, 
        totalWeight
      );
      
      if (success && packedItem) {
        packedItems.push(packedItem);
        totalVolumePacked += item.length * item.width * item.height;
        totalWeight += item.weight;
        console.log(`Successfully packed item ${item.id}`, packedItem);
        
        // Send progress update for this item
        const progressFillPercentage = (totalVolumePacked / containerVolume) * 100;
        const progressWeightPercentage = (totalWeight / container.maxWeight) * 100;
        
        // Send incremental update to show real-time packing
        self.postMessage({
          type: 'item_packed',
          packedItems: [...packedItems],
          unpackedItems: [...unpackedItems, ...sortedItems.slice(i + 1), ...failedItems],
          containerFillPercentage: progressFillPercentage,
          weightCapacityPercentage: progressWeightPercentage,
          totalWeight,
          progress: (i + 1) / sortedItems.length * 100
        });
        
        // Add a small delay to visualize the packing process
        const startTime = performance.now();
        while (performance.now() - startTime < 50) {
          // Busy wait for 50ms to create a visual delay
        }
      } else {
        // Add to failed items for retry
        failedItems.push(item);
        console.log(`Failed to pack item ${item.id}`);
      }
    }
    
    // Retry failed items
    while (failedItems.length > 0 && retryCount < MAX_RETRIES) {
      console.log(`Retry attempt ${retryCount + 1} for ${failedItems.length} failed items`);
      retryCount++;
      
      // Try a different approach for failed items
      const itemsToRetry = [...failedItems];
      failedItems = [];
      
      for (const item of itemsToRetry) {
        // Try with a different rotation priority
        const { packedItem, success } = tryPackItem(
          item, 
          packedItems, 
          container, 
          totalWeight,
          true // Force alternative rotation priority
        );
        
        if (success && packedItem) {
          packedItems.push(packedItem);
          totalVolumePacked += item.length * item.width * item.height;
          totalWeight += item.weight;
          console.log(`Successfully packed item ${item.id} on retry ${retryCount}`);
          
          // Send progress update for this retry item
          const finalFillPercentage = (totalVolumePacked / containerVolume) * 100;
          const finalWeightPercentage = (totalWeight / container.maxWeight) * 100;
          
          self.postMessage({
            type: 'item_packed',
            packedItems: [...packedItems],
            unpackedItems: [...unpackedItems, ...failedItems],
            containerFillPercentage: finalFillPercentage,
            weightCapacityPercentage: finalWeightPercentage,
            totalWeight,
            progress: 100 - (failedItems.length / expandedItems.length * 100)
          });
          
          // Add a small delay to visualize the packing process
          const startTime = performance.now();
          while (performance.now() - startTime < 100) {
            // Busy wait for 100ms
          }
        } else {
          // Still failed after retry
          failedItems.push(item);
        }
      }
    }
    
    // Add any remaining failed items to unpacked
    unpackedItems.push(...failedItems);
    
    // Calculate current metrics for this strategy
    const currentFillPercentage = (totalVolumePacked / containerVolume) * 100;
    const currentWeightPercentage = (totalWeight / container.maxWeight) * 100;
    
    // If we've packed more than 85% of the container, consider this a success
    if (currentFillPercentage > 85) {
      console.log(`Strategy ${strategy} achieved good packing efficiency: ${currentFillPercentage.toFixed(2)}%`);
      break;
    }
    
    // If this strategy didn't work well, reset and try the next one
    if (strategy !== strategies[strategies.length - 1]) {
      console.log(`Strategy ${strategy} didn't achieve good packing, trying next strategy`);
      packedItems.length = 0;
      unpackedItems.length = 0;
      totalVolumePacked = 0;
      totalWeight = 0;
    }
    
    // Log the results of this strategy
    console.log(`Strategy ${strategy} results:`, {
      packedItems: packedItems.length,
      unpackedItems: unpackedItems.length,
      containerFillPercentage: currentFillPercentage,
      weightCapacityPercentage: currentWeightPercentage
    });
    
    // Check if this strategy gave better results
    // We prioritize: 1) Number of packed items, 2) Space utilization
    const currentUtilization = packedItems.length * 1000 + currentFillPercentage;
    
    if (currentUtilization > bestUtilization) {
      bestUtilization = currentUtilization;
      bestResult = {
        packedItems,
        unpackedItems,
        containerFillPercentage: currentFillPercentage,
        weightCapacityPercentage: currentWeightPercentage,
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

// Define algorithm type
type PackingAlgorithm = (items: CargoItem[], container: Container) => PackedResult;

// Algorithm implementations
const algorithms: Record<string, PackingAlgorithm> = {
  // Default algorithm - already implemented
  default: packItems,
  
  // Guillotine Cut Algorithm
  extreme_point: (items: CargoItem[], container: Container): PackedResult => {
    console.log('Using Guillotine Cut Algorithm');
    
    // Sort items by volume in descending order for better packing
    const sortedItems = [...items].sort((a, b) => {
      const volumeA = a.length * a.width * a.height;
      const volumeB = b.length * b.width * b.height;
      return volumeB - volumeA; // Descending order
    });
    
    // Initialize container dimensions
    const containerLength = container.length;
    const containerWidth = container.width;
    const containerHeight = container.height;
    const containerVolume = containerLength * containerWidth * containerHeight;
    
    // Track packed and unpacked items
    const packedItems: PackedItem[] = [];
    const unpackedItems: CargoItem[] = [];
    let totalVolumePacked = 0;
    let totalWeight = 0;
    
    // Define a space (free area) in the container
    type Space = {
      x: number; // x-coordinate (length)
      y: number; // y-coordinate (height)
      z: number; // z-coordinate (width)
      length: number; // length dimension (along x-axis)
      height: number; // height dimension (along y-axis)
      width: number; // width dimension (along z-axis)
    };
    
    // Initialize with one space representing the entire container
    let spaces: Space[] = [
      {
        x: 0,
        y: 0,
        z: 0,
        length: containerLength,
        height: containerHeight,
        width: containerWidth
      }
    ];

    // Function to split a space after placing an item using guillotine cuts
    const splitSpace = (space: Space, item: { width: number; height: number; length: number }, x: number, y: number, z: number): Space[] => {
      // Create the six possible spaces after placing the item
      const possibleSpaces: Space[] = [];
      
      // Space to the right of the item (along x-axis/length)
      if (x + item.length < space.x + space.length) {
        possibleSpaces.push({
          x: x + item.length,
          y: space.y,
          z: space.z,
          length: (space.x + space.length) - (x + item.length),
          height: space.height,
          width: space.width
        });
      }
      
      // Space to the left of the item (along x-axis/length)
      if (x > space.x) {
        possibleSpaces.push({
          x: space.x,
          y: space.y,
          z: space.z,
          length: x - space.x,
          height: space.height,
          width: space.width
        });
      }
      
      // Space above the item (along y-axis/height)
      if (y + item.height < space.y + space.height) {
        possibleSpaces.push({
          x: space.x,
          y: y + item.height,
          z: space.z,
          length: space.length,
          height: (space.y + space.height) - (y + item.height),
          width: space.width
        });
      }
      
      // Space in front of the item (along z-axis/width)
      if (z + item.width < space.z + space.width) {
        possibleSpaces.push({
          x: space.x,
          y: space.y,
          z: z + item.width,
          length: space.length,
          height: space.height,
          width: (space.z + space.width) - (z + item.width)
        });
      }
      
      // Space behind the item (along z-axis/width)
      if (z > space.z) {
        possibleSpaces.push({
          x: space.x,
          y: space.y,
          z: space.z,
          length: space.length,
          height: space.height,
          width: z - space.z
        });
      }
      
      // Filter out spaces that are too small to be useful
      const minDimension = 0.1; // Minimum useful dimension in units
      const filteredSpaces = possibleSpaces.filter(space => 
        space.length >= minDimension && 
        space.height >= minDimension && 
        space.width >= minDimension
      );
      
      return filteredSpaces;
    };
    
    // Function to check if an item fits in a space
    const itemFitsInSpace = (item: CargoItem, space: Space): boolean => {
      // Using consistent dimension mapping: length=x, height=y, width=z
      return (
        item.length <= space.length &&
        item.height <= space.height &&
        item.width <= space.width
      );
    };
    
    // Function to check if an item would overlap with already packed items
    const itemOverlapsWithPacked = (item: CargoItem, x: number, y: number, z: number): boolean => {
      for (const packedItem of packedItems) {
        const px = packedItem.position.x;
        const py = packedItem.position.y;
        const pz = packedItem.position.z;
        
        // Check if the item's bounding box overlaps with the packed item's bounding box
        // Using consistent dimension mapping: x=length, y=height, z=width
        if (x < px + packedItem.length && x + item.length > px &&
            y < py + packedItem.height && y + item.height > py &&
            z < pz + packedItem.width && z + item.width > pz) {
          return true; // Overlap detected
        }
      }
      return false; // No overlap
    };
    
    // Function to check if an item would be outside the container
    const itemOutsideContainer = (item: CargoItem, x: number, y: number, z: number): boolean => {
      // Using consistent dimension mapping: x=length, y=height, z=width
      return (
        x < 0 || x + item.length > containerLength ||
        y < 0 || y + item.height > containerHeight ||
        z < 0 || z + item.width > containerWidth
      );
    };
    
    // Function to find the lowest possible y-position for an item at a given (x,z) coordinate
    // This ensures items don't float in the air
    const findLowestPosition = (item: CargoItem, x: number, z: number): number => {
      let lowestY = 0; // Start at the bottom of the container
      
      for (const packedItem of packedItems) {
        const px = packedItem.position.x;
        const py = packedItem.position.y;
        const pz = packedItem.position.z;
        
        // Check if this item is directly below the position we're checking
        // Using consistent dimension mapping: x=length, y=height, z=width
        if (x < px + packedItem.length && x + item.length > px &&
            z < pz + packedItem.width && z + item.width > pz) {
          // If there's overlap in x and z coordinates, this item could be supporting our new item
          const possibleY = py + packedItem.height;
          if (possibleY > lowestY) {
            lowestY = possibleY;
          }
        }
      }
      
      return lowestY;
    };
    
    // Function to merge spaces for better space utilization
    const mergeSpaces = (spaceList: Space[]): Space[] => {
      if (spaceList.length <= 1) return spaceList;
      
      // First, remove any spaces that are completely contained within others
      let result = [...spaceList];
      
      // Remove fully contained spaces
      for (let i = result.length - 1; i >= 0; i--) {
        if (i >= result.length) continue; // Safety check
        
        const current = result[i];
        for (let j = 0; j < result.length; j++) {
          if (i === j || i >= result.length) continue; // Safety check
          
          const other = result[j];
          if (current.x >= other.x && 
              current.y >= other.y && 
              current.z >= other.z && 
              current.x + current.length <= other.x + other.length &&
              current.y + current.height <= other.y + other.height &&
              current.z + current.width <= other.z + other.width) {
            // Current space is fully contained in other space, remove it
            result.splice(i, 1);
            break;
          }
        }
      }
      
      // Limit the number of spaces to prevent performance issues
      if (result.length > 50) {
        // Sort by volume and keep only the 50 largest spaces
        result.sort((a, b) => {
          const volumeA = a.length * a.height * a.width;
          const volumeB = b.length * b.height * b.width;
          return volumeB - volumeA; // Descending order
        });
        result = result.slice(0, 50);
      }
      
      // Try to merge adjacent spaces with the same dimensions in one direction
      // Limit the number of merge iterations to prevent infinite loops
      let merged = true;
      let mergeIterations = 0;
      const MAX_MERGE_ITERATIONS = 5;
      
      while (merged && result.length > 1 && mergeIterations < MAX_MERGE_ITERATIONS) {
        merged = false;
        mergeIterations++;
        
        for (let i = 0; i < result.length; i++) {
          if (merged) break; // If we merged something, restart the outer loop
          
          for (let j = i + 1; j < result.length; j++) {
            const a = result[i];
            const b = result[j];
            
            // Check if spaces can be merged in the x direction (length)
            if (a.y === b.y && a.z === b.z && a.height === b.height && a.width === b.width) {
              if (a.x + a.length === b.x) {
                // A is directly to the left of B
                a.length += b.length;
                result.splice(j, 1);
                merged = true;
                break;
              } else if (b.x + b.length === a.x) {
                // B is directly to the left of A
                a.x = b.x;
                a.length += b.length;
                result.splice(j, 1);
                merged = true;
                break;
              }
            }
            
            // Check if spaces can be merged in the y direction (height)
            if (!merged && a.x === b.x && a.z === b.z && a.length === b.length && a.width === b.width) {
              if (a.y + a.height === b.y) {
                // A is directly below B
                a.height += b.height;
                result.splice(j, 1);
                merged = true;
                break;
              } else if (b.y + b.height === a.y) {
                // B is directly below A
                a.y = b.y;
                a.height += b.height;
                result.splice(j, 1);
                merged = true;
                break;
              }
            }
            
            // Check if spaces can be merged in the z direction (width)
            if (!merged && a.x === b.x && a.y === b.y && a.length === b.length && a.height === b.height) {
              if (a.z + a.width === b.z) {
                // A is directly behind B
                a.width += b.width;
                result.splice(j, 1);
                merged = true;
                break;
              } else if (b.z + b.width === a.z) {
                // B is directly behind A
                a.z = b.z;
                a.width += b.width;
                result.splice(j, 1);
                merged = true;
                break;
              }
            }
          }
        }
      }
      
      return result;
    };
    
    // Process each item
    for (let i = 0; i < sortedItems.length; i++) {
      const item = sortedItems[i];
      let packed = false;
      
      // Check if adding this item would exceed weight capacity
      if (totalWeight + item.weight > container.maxWeight) {
        unpackedItems.push(item);
        continue;
      }
      
      // Merge spaces periodically to optimize space usage
      if (i % 3 === 0) {
        spaces = mergeSpaces(spaces);
      }
      
      // Sort spaces by volume (smallest first) for better space utilization
      spaces.sort((a, b) => {
        const volumeA = a.length * a.height * a.width;
        const volumeB = b.length * b.height * b.width;
        return volumeA - volumeB; // Ascending order (smallest first)
      });
      
      // Try to find a space for this item
      for (let j = 0; j < spaces.length; j++) {
        const space = spaces[j];
        
        // Check if item fits in this space
        if (itemFitsInSpace(item, space)) {
          // Place item at the bottom-left-back corner of the space
          let x = space.x;
          let z = space.z;
          
          // Find the lowest possible y-coordinate for this item (to prevent floating)
          let y = findLowestPosition(item, x, z);
          
          // Make sure the item is still within the space's height
          if (y + item.height > space.y + space.height) {
            continue; // This item would extend beyond the space's height, try next space
          }
          
          // Double-check that the item is within container bounds
          if (itemOutsideContainer(item, x, y, z)) {
            continue; // Item would be outside the container, try next space
          }
          
          // Check if this placement would overlap with already packed items
          if (itemOverlapsWithPacked(item, x, y, z)) {
            continue; // Try the next space
          }
          
          // Add to packed items
          packedItems.push({
            id: item.id,
            name: item.name,
            width: item.width,
            height: item.height,
            length: item.length,
            weight: item.weight,
            color: item.color,
            quantity: item.quantity,
            constraints: item.constraints,
            position: { x, y, z },
            rotation: { x: 0, y: 0, z: 0 } // No rotation in this implementation
          });
          
          // Update totals
          const itemVolume = item.width * item.height * item.length;
          totalVolumePacked += itemVolume;
          totalWeight += item.weight;
          
          // Split the space and get new spaces
          const newSpaces = splitSpace(space, item, x, y, z);
          
          // Remove the used space and add new spaces
          spaces.splice(j, 1);
          spaces.push(...newSpaces);
          
          // Send progress update
          const progress = ((i + 1) / sortedItems.length) * 100;
          
          // Only send updates every few items to reduce message overhead
          if (i % 3 === 0 || i === sortedItems.length - 1) {
            self.postMessage({
              type: 'item_packed',
              packedItems: [...packedItems],
              unpackedItems: [],
              containerFillPercentage: (totalVolumePacked / containerVolume) * 100,
              weightCapacityPercentage: (totalWeight / container.maxWeight) * 100,
              totalWeight,
              progress
            });
          }
          
          packed = true;
          break;
        }
      }
      
      // If item couldn't be packed, add to unpacked items
      if (!packed) {
        unpackedItems.push(item);
      }
    }
    
    // Calculate final statistics
    const containerFillPercentage = (totalVolumePacked / containerVolume) * 100;
    const weightCapacityPercentage = (totalWeight / container.maxWeight) * 100;
    
    return {
      packedItems,
      unpackedItems,
      containerFillPercentage,
      weightCapacityPercentage,
      totalWeight
    };
  },
  
  // Shelving with Search Algorithm
  layer_based: (items: CargoItem[], container: Container): PackedResult => {
    console.log('Using Shelving with Search Algorithm');
    // Placeholder implementation
    return packItems(items, container);
  },
  
  // Genetic Algorithm
  genetic: (items: CargoItem[], container: Container): PackedResult => {
    console.log('Using Genetic algorithm');
    // Placeholder implementation
    return packItems(items, container);
  },
  
  // Reinforcement Deep Learning
  simulated_annealing: (items: CargoItem[], container: Container): PackedResult => {
    console.log('Using Reinforcement Deep Learning algorithm');
    // Placeholder implementation
    return packItems(items, container);
  }
};

// Worker message handler
console.log('Setting up worker message handler');

self.onmessage = (event) => {
  console.log('Worker received message:', event.data);
  
  const { items, container, algorithm = 'default' } = event.data;
  
  if (!items || !container) {
    console.error('Missing required data in worker message');
    self.postMessage({ 
      error: 'Missing required data',
      packedItems: [],
      unpackedItems: [],
      containerFillPercentage: 0,
      weightCapacityPercentage: 0,
      totalWeight: 0
    });
    return;
  }
  
  try {
    // Select the appropriate algorithm
    const selectedAlgorithm = algorithms[algorithm] || algorithms.default;
    
    // Start the packing algorithm
    console.log(`Starting packing algorithm in worker: ${algorithm}`);
    
    // Send initial progress update
    self.postMessage({ 
      type: 'progress', 
      value: 0,
      packedItems: [],
      unpackedItems: [],
      containerFillPercentage: 0,
      weightCapacityPercentage: 0,
      totalWeight: 0
    });
    
    // Run the selected algorithm
    const result = selectedAlgorithm(items, container);
    
    // Ensure the result has all required properties
    const validatedResult = {
      ...result,
      packedItems: result.packedItems || [],
      unpackedItems: result.unpackedItems || [],
      containerFillPercentage: result.containerFillPercentage || 0,
      weightCapacityPercentage: result.weightCapacityPercentage || 0,
      totalWeight: result.totalWeight || 0
    };
    
    // Send the result back to the main thread
    console.log('Packing complete, sending result back with validated data');
    
    // Consolidate unpacked items by grouping them back by their original ID
    const consolidatedUnpacked: { [key: string]: CargoItem & { quantity: number } } = {};
    
    validatedResult.unpackedItems.forEach((item: CargoItem) => {
      // Extract the original item ID (before the dash)
      const originalId = item.id.split('-')[0];
      
      if (consolidatedUnpacked[originalId]) {
        consolidatedUnpacked[originalId].quantity += 1;
      } else {
        consolidatedUnpacked[originalId] = {
          ...item,
          id: originalId,
          quantity: 1
        };
      }
    });
    
    // Update the result with consolidated unpacked items
    const finalUnpackedItems = Object.values(consolidatedUnpacked);
    self.postMessage({
      ...validatedResult,
      unpackedItems: finalUnpackedItems
    });
    
    console.log('Worker completed packing algorithm with result:', {
      packedItems: validatedResult.packedItems.length,
      unpackedItems: validatedResult.unpackedItems.length,
      fillPercentage: validatedResult.containerFillPercentage.toFixed(2) + '%'
    });
  } catch (error: unknown) {
    console.error('Worker encountered an error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    self.postMessage({ error: errorMessage });
  }
};

console.log('Worker script initialization complete');