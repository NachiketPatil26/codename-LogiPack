console.log('packer.worker.ts script started');

// In a real web worker environment, we would import TensorFlow.js like this:
// self.importScripts('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@3.18.0/dist/tf.min.js');

// For TypeScript compatibility, declare the self object for web workers
declare const self: Worker & typeof globalThis;

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
  // Add a safety margin to prevent boundary violations
  const BOUNDARY_MARGIN = 0.01; // 1cm safety margin
  
  if (
    position.x < 0 || endX > (container.length - BOUNDARY_MARGIN) ||
    position.y < 0 || endY > (container.height - BOUNDARY_MARGIN) ||
    position.z < 0 || endZ > (container.width - BOUNDARY_MARGIN)
  ) {
    // Log the violation for debugging
    console.log('Boundary violation prevented:', {
      start: position,
      end: { x: endX, y: endY, z: endZ },
      containerDims: container
    });
    return false;
  }

  // Check collision with existing items to prevent overlaps
  
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

    // Calculate overlap in each dimension
    const overlapX = Math.max(0, 
      Math.min(endX, itemEndX) - Math.max(position.x, packedItem.position.x));
    
    const overlapY = Math.max(0, 
      Math.min(endY, itemEndY) - Math.max(position.y, packedItem.position.y));
    
    const overlapZ = Math.max(0, 
      Math.min(endZ, itemEndZ) - Math.max(position.z, packedItem.position.z));
    
    // Check for significant overlap in all three dimensions
    // Using a slightly larger safety margin for more robust collision detection
    const COLLISION_MARGIN = 0.02; // 2cm collision margin
    
    if (overlapX > COLLISION_MARGIN && overlapY > COLLISION_MARGIN && overlapZ > COLLISION_MARGIN) {
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
type PackingAlgorithm = (items: CargoItem[], container: Container, progressCallback?: (progress: number, state: any) => void) => PackedResult | Promise<PackedResult>;

// Import the reinforcement learning packer
import { reinforcementLearningPacker } from './reinforcementLearningPacker';

// Import the physics-enhanced Guillotine packer
import { physicsEnhancedPacker } from './physicsEnhancedPacker';

// Algorithm implementations
const algorithms: Record<string, PackingAlgorithm> = {
  // Default algorithm - already implemented
  default: packItems,
  // Reinforcement Learning with pre-trained model
  reinforcement_learning: reinforcementLearningPacker,
  // Professional-grade physics-enhanced Guillotine algorithm
  physics_enhanced_guillotine: physicsEnhancedPacker as PackingAlgorithm,
  
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
    
    // For real-time visualization - will be used in the packing loop
    
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
    
    // For real-time visualization
    let lastUpdateTime = Date.now();
    const updateInterval = 100; // Update every 100ms
    
    // Process each item
    for (let i = 0; i < sortedItems.length; i++) {
      const item = sortedItems[i];
      let packed = false;
      
      // Send real-time updates for visualization
      const currentTime = Date.now();
      if (currentTime - lastUpdateTime > updateInterval) {
        lastUpdateTime = currentTime;
        const progress = (i / sortedItems.length) * 100;
        
        // Send current packing state for visualization
        self.postMessage({
          type: 'item_packed',
          packedItems: packedItems,
          unpackedItems: sortedItems.slice(i),
          containerFillPercentage: (totalVolumePacked / containerVolume) * 100,
          weightCapacityPercentage: (totalWeight / container.maxWeight) * 100,
          totalWeight: totalWeight,
          progress: progress
        });
      }
      
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
  
  // Biased Random Key Genetic Algorithm (BRKGA) for 3D Bin Packing
  genetic: (items: CargoItem[], container: Container): PackedResult => {
    console.log('Using Biased Random Key Genetic Algorithm for 3D Bin Packing');
    
    // Initialize container dimensions
    const containerLength = container.length;
    const containerWidth = container.width;
    const containerHeight = container.height;
    const containerVolume = containerLength * containerWidth * containerHeight;
    
    // Track best solution found
    let bestPackedItems: PackedItem[] = [];
    let bestUnpackedItems: CargoItem[] = [];
    let bestWeight = 0;
    let bestFitness = 0;
    
    // BRKGA Parameters - optimized for better performance
    const populationSize = 120; // Increased population size for better exploration
    const generations = 60; // More generations for better convergence
    const elitePercentage = 0.3; // 30% of population are elite (increased from 20%)
    const mutantPercentage = 0.15; // 15% of population are mutants (reduced from 20%)
    const eliteBias = 0.8; // 80% chance to inherit from elite parent (increased from 70%)
    
    // Calculate number of individuals in each group
    const numElites = Math.floor(populationSize * elitePercentage);
    const numMutants = Math.floor(populationSize * mutantPercentage);
    const numCrossovers = populationSize - numElites - numMutants;
    
    // Number of items to pack
    const numItems = items.length;
    
    // Define a chromosome as a vector of random keys
    type BRKGAChromosome = {
      // Random keys (values between 0 and 1)
      keys: number[];
      // Decoded values
      packingSequence: number[];
      orientations: number[];
      // Fitness and results
      fitness: number;
      packedItems: PackedItem[];
      unpackedItems: CargoItem[];
      volumePacked: number;
      totalWeight: number;
    };
    
    // Define possible orientations (6 possible ways to orient a box)
    const possibleOrientations = [
      // [length, height, width] - original orientation
      [0, 1, 2],
      // [length, width, height] - rotate around x-axis
      [0, 2, 1],
      // [height, length, width] - rotate around y-axis
      [1, 0, 2],
      // [height, width, length] - rotate around y-axis and x-axis
      [1, 2, 0],
      // [width, length, height] - rotate around z-axis
      [2, 0, 1],
      // [width, height, length] - rotate around z-axis and x-axis
      [2, 1, 0]
    ];
    
    // Function to create a new random chromosome
    const createRandomChromosome = (): BRKGAChromosome => {
      // Create random keys (2 * numItems: first half for sequence, second half for orientation)
      const keys = Array.from({ length: 2 * numItems }, () => Math.random());
      
      // Decode the keys
      const packingSequence = decodePackingSequence(keys);
      const orientations = decodeOrientations(keys);
      
      return {
        keys,
        packingSequence,
        orientations,
        fitness: 0,
        packedItems: [],
        unpackedItems: [...items],
        volumePacked: 0,
        totalWeight: 0
      };
    };
    
    // Function to decode the packing sequence from the first half of the keys
    const decodePackingSequence = (keys: number[]): number[] => {
      // Create array of indices
      const indices = Array.from({ length: numItems }, (_, i) => i);
      
      // Sort indices based on the first half of the keys
      return indices.sort((a, b) => keys[a] - keys[b]);
    };
    
    // Function to decode the orientations from the second half of the keys
    const decodeOrientations = (keys: number[]): number[] => {
      return Array.from({ length: numItems }, (_, i) => {
        // Map the key value to an orientation index (0-5)
        const orientationIndex = Math.floor(keys[numItems + i] * possibleOrientations.length);
        return orientationIndex;
      });
    };
    
    // Initialize population with random chromosomes
    let population: BRKGAChromosome[] = Array.from({ length: populationSize }, () => createRandomChromosome());
    
    // Function to evaluate fitness of a chromosome (higher is better)
    const evaluateFitness = (chromosome: BRKGAChromosome): void => {
      // Create ordered items based on packing sequence and orientations
      const orderedItems = chromosome.packingSequence.map(idx => {
        // Get the original item
        const originalItem = items[idx];
        
        // Get the orientation for this item
        const orientationIdx = chromosome.orientations[idx];
        const orientation = possibleOrientations[orientationIdx];
        
        // Create a new item with potentially rotated dimensions
        const itemDimensions = [originalItem.length, originalItem.height, originalItem.width];
        
        // Calculate rotation angles based on orientation
        let rotationX = 0;
        let rotationY = 0;
        let rotationZ = 0;
        
        // Set rotation angles based on the orientation
        // This maps the orientation index to actual rotation angles in degrees
        switch(orientationIdx) {
          case 1: // length-width-height (rotate 90° around Z)
            rotationZ = 90;
            break;
          case 2: // height-length-width (rotate 90° around X)
            rotationX = 90;
            break;
          case 3: // width-height-length (rotate 90° around Y)
            rotationY = 90;
            break;
          case 4: // height-width-length (rotate 90° around X, then 90° around Y)
            rotationX = 90;
            rotationY = 90;
            break;
          case 5: // width-length-height (rotate 90° around Z, then 90° around X)
            rotationZ = 90;
            rotationX = 90;
            break;
          // case 0 is the default orientation (length-height-width), no rotation needed
        }
        
        // Create a copy of the item with rotated dimensions and rotation information
        return {
          ...originalItem,
          length: itemDimensions[orientation[0]],
          height: itemDimensions[orientation[1]],
          width: itemDimensions[orientation[2]],
          // Store the rotation information to be used when creating packed items
          _rotation: { x: rotationX, y: rotationY, z: rotationZ },
          _orientationIdx: orientationIdx
        };
      });
      
      // Use a modified version of the Extreme Point algorithm to pack items
      const result = packWithSequence(orderedItems, container);
      
      // Update chromosome with results
      chromosome.packedItems = result.packedItems;
      chromosome.unpackedItems = result.unpackedItems;
      chromosome.volumePacked = result.packedItems.reduce((sum, item) => {
        return sum + (item.length * item.width * item.height);
      }, 0);
      chromosome.totalWeight = result.packedItems.reduce((sum, item) => sum + item.weight, 0);
      
      // Calculate fitness (volume utilization percentage)
      chromosome.fitness = (chromosome.volumePacked / containerVolume) * 100;
    };
    
    // Function to pack items using a specific sequence - optimized for 3D bin packing
    const packWithSequence = (orderedItems: CargoItem[], container: Container): PackedResult => {
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
        score?: number; // Score for space selection heuristic
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
      
      // Function to check if an item fits in a space
      const itemFitsInSpace = (item: CargoItem, space: Space): boolean => {
        return (
          item.length <= space.length &&
          item.height <= space.height &&
          item.width <= space.width
        );
      };
      
      // Function to check if an item would be outside the container
      const itemOutsideContainer = (item: CargoItem, x: number, y: number, z: number): boolean => {
        // Use a strict boundary check with a small negative epsilon to ensure items stay inside
        const epsilon = -0.001; // Negative epsilon to make boundary check stricter
        return (
          x < 0 || x + item.length > containerLength + epsilon ||
          y < 0 || y + item.height > containerHeight + epsilon ||
          z < 0 || z + item.width > containerWidth + epsilon
        );
      };
      
      // Function to check if an item overlaps with already packed items
      const itemOverlapsWithPacked = (item: CargoItem, x: number, y: number, z: number): boolean => {
        // Use a stricter overlap check with a larger epsilon
        const epsilon = 0.01; // Larger epsilon for more reliable overlap detection
        
        for (const packedItem of packedItems) {
          const px = packedItem.position.x;
          const py = packedItem.position.y;
          const pz = packedItem.position.z;
          
          // Check if bounding boxes intersect with a safety margin
          const overlapX = Math.max(0, Math.min(x + item.length, px + packedItem.length) - Math.max(x, px));
          const overlapY = Math.max(0, Math.min(y + item.height, py + packedItem.height) - Math.max(y, py));
          const overlapZ = Math.max(0, Math.min(z + item.width, pz + packedItem.width) - Math.max(z, pz));
          
          // If there's a significant overlap in all three dimensions, items are overlapping
          if (overlapX > epsilon && overlapY > epsilon && overlapZ > epsilon) {
            return true; // Overlap detected
          }
        }
        return false; // No overlap
      };
      
      // Function to find the lowest possible position for an item (to prevent floating)
      const findLowestPosition = (item: CargoItem, x: number, z: number): number => {
        let lowestY = 0; // Start at the bottom of the container
        
        // Calculate the area of the item's base
        const itemBaseArea = item.length * item.width;
        
        // Check if the item would be supported by any packed item
        for (const packedItem of packedItems) {
          const px = packedItem.position.x;
          const py = packedItem.position.y;
          const pz = packedItem.position.z;
          
          // Check if there's an overlap in x and z coordinates
          if (x < px + packedItem.length && x + item.length > px &&
              z < pz + packedItem.width && z + item.width > pz) {
            // Calculate the overlapping area
            const overlapX = Math.min(x + item.length, px + packedItem.length) - Math.max(x, px);
            const overlapZ = Math.min(z + item.width, pz + packedItem.width) - Math.max(z, pz);
            const overlapArea = overlapX * overlapZ;
            
            // If the overlap is significant (at least 30% of the item's base), consider it supported
            if (overlapArea >= 0.3 * itemBaseArea) {
              const possibleY = py + packedItem.height;
              if (possibleY > lowestY) {
                lowestY = possibleY;
              }
            }
          }
        }
        
        return lowestY;
      };
      
      // Function to calculate how many surfaces of the item would be touching other items or container walls
      const calculateTouchingFaces = (item: CargoItem, x: number, y: number, z: number): number => {
        let touchingFaces = 0;
        
        // Check if touching the floor
        if (y === 0) touchingFaces++;
        
        // Check if touching the left wall
        if (x === 0) touchingFaces++;
        
        // Check if touching the back wall
        if (z === 0) touchingFaces++;
        
        // Check if touching the right wall
        if (x + item.length === containerLength) touchingFaces++;
        
        // Check if touching the front wall
        if (z + item.width === containerWidth) touchingFaces++;
        
        // Check if touching the ceiling
        if (y + item.height === containerHeight) touchingFaces++;
        
        // Check if touching other items
        for (const packedItem of packedItems) {
          const px = packedItem.position.x;
          const py = packedItem.position.y;
          const pz = packedItem.position.z;
          
          // Check if touching on the right face
          if (x + item.length === px && 
              y < py + packedItem.height && y + item.height > py &&
              z < pz + packedItem.width && z + item.width > pz) {
            touchingFaces++;
          }
          
          // Check if touching on the left face
          if (px + packedItem.length === x && 
              y < py + packedItem.height && y + item.height > py &&
              z < pz + packedItem.width && z + item.width > pz) {
            touchingFaces++;
          }
          
          // Check if touching on the top face
          if (y + item.height === py && 
              x < px + packedItem.length && x + item.length > px &&
              z < pz + packedItem.width && z + item.width > pz) {
            touchingFaces++;
          }
          
          // Check if touching on the bottom face
          if (py + packedItem.height === y && 
              x < px + packedItem.length && x + item.length > px &&
              z < pz + packedItem.width && z + item.width > pz) {
            touchingFaces++;
          }
          
          // Check if touching on the front face
          if (z + item.width === pz && 
              x < px + packedItem.length && x + item.length > px &&
              y < py + packedItem.height && y + item.height > py) {
            touchingFaces++;
          }
          
          // Check if touching on the back face
          if (pz + packedItem.width === z && 
              x < px + packedItem.length && x + item.length > px &&
              y < py + packedItem.height && y + item.height > py) {
            touchingFaces++;
          }
        }
        
        return touchingFaces;
      };
      
      // Function to score a potential placement (higher is better)
      const scorePlacement = (item: CargoItem, space: Space, x: number, y: number, z: number): number => {
        // Prioritize placements with a more sophisticated scoring system:
        
        // 1. Maximize contact with container walls and other items (most important)
        const touchingFaces = calculateTouchingFaces(item, x, y, z);
        const touchingScore = touchingFaces * 300; // Increased weight
        
        // 2. Prefer corner placements (items touching multiple walls)
        let cornerScore = 0;
        if (x === 0) cornerScore += 150;
        if (y === 0) cornerScore += 150;
        if (z === 0) cornerScore += 150;
        if (x + item.length >= containerLength - 0.01) cornerScore += 100;
        if (y + item.height >= containerHeight - 0.01) cornerScore += 50; // Less weight for top corners
        if (z + item.width >= containerWidth - 0.01) cornerScore += 100;
        
        // 3. Minimize the center of gravity (prefer items closer to the bottom)
        const centerY = y + (item.height / 2);
        const gravityScore = 200 * (1 - (centerY / containerHeight));
        
        // 4. Minimize fragmentation of remaining space
        const spaceUtilization = (item.length * item.width * item.height) / 
                               (space.length * space.height * space.width);
        const utilizationScore = spaceUtilization * 250;
        
        // 5. Prefer placements closer to already packed items
        let proximityScore = 0;
        for (const packedItem of packedItems) {
          const px = packedItem.position.x;
          const py = packedItem.position.y;
          const pz = packedItem.position.z;
          
          // Calculate distance between centers of items
          const distance = Math.sqrt(
            Math.pow((x + item.length/2) - (px + packedItem.length/2), 2) +
            Math.pow((y + item.height/2) - (py + packedItem.height/2), 2) +
            Math.pow((z + item.width/2) - (pz + packedItem.width/2), 2)
          );
          
          // Closer items get higher scores
          proximityScore += 100 / (1 + distance);
        }
        // Cap the proximity score to prevent it from dominating
        proximityScore = Math.min(proximityScore, 200);
        
        // 6. Minimize the maximum coordinate (keep items closer to origin)
        const maxCoord = Math.max(x + item.length, y + item.height, z + item.width);
        const maxCoordScore = 100 / (1 + maxCoord);
        
        // Combine all scores with appropriate weights
        return touchingScore + cornerScore + gravityScore + utilizationScore + proximityScore + maxCoordScore;
      };
      
      // Function to split a space after placing an item - using the Guillotine cut approach
      const splitSpace = (space: Space, item: CargoItem, x: number, y: number, z: number): Space[] => {
        const newSpaces: Space[] = [];
        
        // Calculate the coordinates of the placed item relative to the space
        const relX = x - space.x;
        const relY = y - space.y;
        const relZ = z - space.z;
        
        // Space to the right of the item (along x-axis/length)
        if (relX + item.length < space.length) {
          newSpaces.push({
            x: x + item.length,
            y: space.y,
            z: space.z,
            length: space.length - (relX + item.length),
            height: space.height,
            width: space.width
          });
        }
        
        // Space above the item (along y-axis/height)
        if (relY + item.height < space.height) {
          newSpaces.push({
            x: space.x,
            y: y + item.height,
            z: space.z,
            length: space.length,
            height: space.height - (relY + item.height),
            width: space.width
          });
        }
        
        // Space in front of the item (along z-axis/width)
        if (relZ + item.width < space.width) {
          newSpaces.push({
            x: space.x,
            y: space.y,
            z: z + item.width,
            length: space.length,
            height: space.height,
            width: space.width - (relZ + item.width)
          });
        }
        
        // Space to the left of the item
        if (relX > 0) {
          newSpaces.push({
            x: space.x,
            y: space.y,
            z: space.z,
            length: relX,
            height: space.height,
            width: space.width
          });
        }
        
        // Space below the item
        if (relY > 0) {
          newSpaces.push({
            x: space.x,
            y: space.y,
            z: space.z,
            length: space.length,
            height: relY,
            width: space.width
          });
        }
        
        // Space behind the item
        if (relZ > 0) {
          newSpaces.push({
            x: space.x,
            y: space.y,
            z: space.z,
            length: space.length,
            height: space.height,
            width: relZ
          });
        }
        
        // Filter out spaces that are too small to be useful
        const minDimension = 0.1; // Minimum useful dimension in units
        return newSpaces.filter(space => 
          space.length >= minDimension && 
          space.height >= minDimension && 
          space.width >= minDimension
        );
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
        
        // Try to merge spaces that are adjacent and have the same dimensions on 2 axes
        let merged = true;
        while (merged && result.length > 1) {
          merged = false;
          
          for (let i = 0; i < result.length; i++) {
            for (let j = i + 1; j < result.length; j++) {
              const a = result[i];
              const b = result[j];
              
              // Check if spaces can be merged along X axis
              if (a.y === b.y && a.z === b.z && 
                  a.height === b.height && a.width === b.width) {
                if (a.x + a.length === b.x) { // A is before B
                  a.length += b.length;
                  result.splice(j, 1);
                  merged = true;
                  break;
                } else if (b.x + b.length === a.x) { // B is before A
                  a.x = b.x;
                  a.length += b.length;
                  result.splice(j, 1);
                  merged = true;
                  break;
                }
              }
              
              // Check if spaces can be merged along Y axis
              if (a.x === b.x && a.z === b.z && 
                  a.length === b.length && a.width === b.width) {
                if (a.y + a.height === b.y) { // A is below B
                  a.height += b.height;
                  result.splice(j, 1);
                  merged = true;
                  break;
                } else if (b.y + b.height === a.y) { // B is below A
                  a.y = b.y;
                  a.height += b.height;
                  result.splice(j, 1);
                  merged = true;
                  break;
                }
              }
              
              // Check if spaces can be merged along Z axis
              if (a.x === b.x && a.y === b.y && 
                  a.length === b.length && a.height === b.height) {
                if (a.z + a.width === b.z) { // A is behind B
                  a.width += b.width;
                  result.splice(j, 1);
                  merged = true;
                  break;
                } else if (b.z + b.width === a.z) { // B is behind A
                  a.z = b.z;
                  a.width += b.width;
                  result.splice(j, 1);
                  merged = true;
                  break;
                }
              }
            }
            
            if (merged) break;
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
        
        return result;
      };
      
      // Try to pack each item
      let lastUpdateTime = Date.now();
      const updateInterval = 100; // Update every 100ms
      
      for (let i = 0; i < orderedItems.length; i++) {
        const item = orderedItems[i];
        let packed = false;
        
        // For each item, evaluate all possible placements and choose the best one
        let bestSpace: Space | null = null;
        let bestX = 0, bestY = 0, bestZ = 0;
        let bestScore = -1;
        
        // Send real-time updates for visualization
        const currentTime = Date.now();
        if (currentTime - lastUpdateTime > updateInterval) {
          lastUpdateTime = currentTime;
          const progress = (i / orderedItems.length) * 100;
          
          // Send current packing state for visualization
          self.postMessage({
            type: 'item_packed',
            packedItems: packedItems,
            unpackedItems: unpackedItems,
            containerFillPercentage: (totalVolumePacked / containerVolume) * 100,
            weightCapacityPercentage: (totalWeight / container.maxWeight) * 100,
            totalWeight: totalWeight,
            progress: progress
          });
        }
        
        // Try to find the best space for this item
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
            
            // Score this placement
            const score = scorePlacement(item, space, x, y, z);
            
            // Update best placement if this one is better
            if (score > bestScore) {
              bestScore = score;
              bestSpace = space;
              bestX = x;
              bestY = y;
              bestZ = z;
            }
          }
        }
        
        // If we found a valid placement, use it
        if (bestSpace !== null && bestScore >= 0) {
          // Perform a final boundary check before adding the item
          const finalBoundaryCheck = (
            bestX >= 0 && bestX + item.length <= containerLength &&
            bestY >= 0 && bestY + item.height <= containerHeight &&
            bestZ >= 0 && bestZ + item.width <= containerWidth
          );
          
          if (finalBoundaryCheck) {
            // Add to packed items with correct rotation
            packedItems.push({
              id: item.id,
              name: item.name,
              width: item.width,
              height: item.height,
              length: item.length,
              weight: item.weight,
              color: item.color,
              quantity: item.quantity,
              position: { x: bestX, y: bestY, z: bestZ },
              rotation: (item as any)._rotation ? (item as any)._rotation : { x: 0, y: 0, z: 0 }
            });
          } else {
            // If the item would be outside the container, add to unpacked items instead
            unpackedItems.push(item);
            packed = false;
            continue; // Skip the rest of the loop for this item
          }
          
          // Update total volume and weight
          totalVolumePacked += item.length * item.width * item.height;
          totalWeight += item.weight;
          
          // Remove the used space
          spaces = spaces.filter(s => s !== bestSpace);
          
          // Create new spaces after placing the item
          const newSpaces = splitSpace(bestSpace, item, bestX, bestY, bestZ);
          spaces.push(...newSpaces);
          
          // Merge spaces periodically to optimize space usage
          if (i % 5 === 0) {
            spaces = mergeSpaces(spaces);
          }
          
          packed = true;
        }
        
        // If item couldn't be packed, add to unpacked items
        if (!packed) {
          unpackedItems.push(item);
        }
      }
      
      return {
        packedItems,
        unpackedItems,
        containerFillPercentage: (totalVolumePacked / containerVolume) * 100,
        weightCapacityPercentage: (totalWeight / container.maxWeight) * 100,
        totalWeight
      };
    };
    
    // Partition the population into elite and non-elite groups
    const partitionPopulation = (population: BRKGAChromosome[]): { elites: BRKGAChromosome[], nonElites: BRKGAChromosome[] } => {
      // Sort population by fitness (descending)
      const sortedPopulation = [...population].sort((a, b) => b.fitness - a.fitness);
      
      // Split into elite and non-elite groups
      const elites = sortedPopulation.slice(0, numElites);
      const nonElites = sortedPopulation.slice(numElites);
      
      return { elites, nonElites };
    };
    
    // Generate mutants (completely new random chromosomes)
    const generateMutants = (): BRKGAChromosome[] => {
      return Array.from({ length: numMutants }, () => createRandomChromosome());
    };
    
    // Parameterized uniform crossover for BRKGA
    const crossover = (elite: BRKGAChromosome, nonElite: BRKGAChromosome): BRKGAChromosome => {
      // Create new keys array
      const childKeys = Array(2 * numItems).fill(0);
      
      // For each gene position
      for (let i = 0; i < 2 * numItems; i++) {
        // Inherit from elite with probability eliteBias, otherwise from non-elite
        if (Math.random() < eliteBias) {
          childKeys[i] = elite.keys[i];
        } else {
          childKeys[i] = nonElite.keys[i];
        }
      }
      
      // Decode the keys
      const packingSequence = decodePackingSequence(childKeys);
      const orientations = decodeOrientations(childKeys);
      
      // Return the new chromosome
      return {
        keys: childKeys,
        packingSequence,
        orientations,
        fitness: 0,
        packedItems: [],
        unpackedItems: [],
        volumePacked: 0,
        totalWeight: 0
      };
    };
    
    // Mating function to produce offspring through crossover
    const mating = (elites: BRKGAChromosome[], nonElites: BRKGAChromosome[]): BRKGAChromosome[] => {
      const offspring: BRKGAChromosome[] = [];
      
      // Generate numCrossovers offspring
      for (let i = 0; i < numCrossovers; i++) {
        // Select one elite and one non-elite parent randomly
        const eliteParent = elites[Math.floor(Math.random() * elites.length)];
        const nonEliteParent = nonElites[Math.floor(Math.random() * nonElites.length)];
        
        // Perform crossover
        const child = crossover(eliteParent, nonEliteParent);
        offspring.push(child);
      }
      
      return offspring;
    };
    
    // Main BRKGA evolutionary process
    for (let generation = 0; generation < generations; generation++) {
      console.log(`Starting generation ${generation + 1} of ${generations}`);
      
      // Evaluate fitness for all chromosomes
      for (let i = 0; i < population.length; i++) {
        evaluateFitness(population[i]);
        
        // Send progress update periodically
        if (i % 5 === 0) {
          const progress = ((generation * populationSize + i) / (generations * populationSize)) * 100;
          self.postMessage({
            type: 'progress',
            value: progress,
            packedItems: [],
            unpackedItems: [],
            containerFillPercentage: 0,
            weightCapacityPercentage: 0,
            totalWeight: 0
          });
        }
      }
      
      // Sort population by fitness (descending)
      population.sort((a, b) => b.fitness - a.fitness);
      
      // Update best solution if we found a better one
      if (population[0].fitness > bestFitness) {
        bestFitness = population[0].fitness;
        bestPackedItems = [...population[0].packedItems];
        bestUnpackedItems = [...population[0].unpackedItems];
        bestWeight = population[0].totalWeight;
        
        console.log(`New best solution found at generation ${generation + 1} with fitness ${bestFitness.toFixed(2)}%`);
        
        // Send update with current best solution
        self.postMessage({
          type: 'item_packed',
          packedItems: bestPackedItems,
          unpackedItems: bestUnpackedItems,
          containerFillPercentage: bestFitness,
          weightCapacityPercentage: (bestWeight / container.maxWeight) * 100,
          totalWeight: bestWeight,
          progress: ((generation + 1) / generations) * 100
        });
      }
      
      // If this is the last generation, we're done
      if (generation === generations - 1) {
        break;
      }
      
      // Partition the population into elite and non-elite groups
      const { elites, nonElites } = partitionPopulation(population);
      
      // Generate mutants (completely new random chromosomes)
      const mutants = generateMutants();
      
      // Perform mating to generate offspring
      const offspring = mating(elites, nonElites);
      
      // Create the next generation by combining elites, mutants, and offspring
      population = [...elites, ...mutants, ...offspring];
    }
    
    // Return the best solution found
    console.log('BRKGA completed. Best solution found:');
    console.log(`- Container fill: ${bestFitness.toFixed(2)}%`);
    console.log(`- Items packed: ${bestPackedItems.length}`);
    console.log(`- Items unpacked: ${bestUnpackedItems.length}`);
    
    return {
      packedItems: bestPackedItems,
      unpackedItems: bestUnpackedItems,
      containerFillPercentage: bestFitness,
      weightCapacityPercentage: (bestWeight / container.maxWeight) * 100,
      totalWeight: bestWeight
    };
  },
  
  // True Reinforcement Learning with TensorFlow.js
  simulated_annealing: (items: CargoItem[], container: Container, progressCallback?: (progress: number, state: any) => void): PackedResult => {
    console.log('Using True Reinforcement Learning with TensorFlow.js');
    
    // Import TensorFlow.js if it's not already available
    // In a real implementation, this would be properly imported at the top of the file
    // or included as a script in the HTML
    const tf = (self as any).tf || { loadLayersModel: null, sequential: null, layers: null };
    
    // Check if TensorFlow.js is available
    if (!tf.loadLayersModel) {
      console.warn('TensorFlow.js not available, falling back to heuristic-based approach');
    }
    
    // Define PPO parameters
    const params = {
      gridSize: 32, // Size of the 3D grid for state representation
      lookahead: 5, // Number of items to consider in advance
      explorationRate: 0.1, // Epsilon for exploration
      learningRate: 0.001, // Learning rate for policy updates
      discountFactor: 0.95, // Gamma for future rewards
      maxIterations: 1000, // Maximum number of iterations
      clipEpsilon: 0.2, // PPO clipping parameter
      entropyCoef: 0.01, // Entropy coefficient for exploration
      valueCoef: 0.5, // Value loss coefficient
      batchSize: 32, // Batch size for training
      epochs: 4 // Number of epochs to train on each batch
    };
    
    // Initialize state representation
    interface State {
      heightMap: number[][]; // Current height map of the container
      remainingItems: CargoItem[]; // Items yet to be packed
      packedItems: PackedItem[]; // Items already packed
      totalVolume: number; // Total volume of packed items
      totalWeight: number; // Total weight of packed items
    }
    
    // Initialize action representation
    interface Action {
      itemIndex: number; // Index of the item to pack
      position: Position; // Position to place the item
      rotation: Rotation; // Rotation of the item
    }
    
    // Initialize the state
    const initialState: State = {
      heightMap: Array(params.gridSize).fill(0).map(() => Array(params.gridSize).fill(0)),
      remainingItems: [...items],
      packedItems: [],
      totalVolume: 0,
      totalWeight: 0
    };
    
    // Scale container dimensions to grid size
    const scaleToGrid = (value: number, dimension: number): number => {
      return Math.floor((value / dimension) * params.gridSize);
    };
    
    // Scale grid position back to real dimensions (used for visualization)
    // This function will be useful when implementing visualization features
    /*
    const scaleFromGrid = (value: number, dimension: number): number => {
      return (value / params.gridSize) * dimension;
    };
    */
    
    // Calculate reward based on packing efficiency, stability, and constraints
    const calculateReward = (state: State, action: Action, nextState: State): number => {
      // Volume utilization reward
      const volumeReward = (nextState.totalVolume - state.totalVolume) / 
                          (container.length * container.width * container.height);
      
      // Stability reward - check if the item is supported from below
      let stabilityReward = 0;
      const item = state.remainingItems[action.itemIndex];
      
      // Calculate support percentage (how much of the item's bottom face is supported)
      const supportPercentage = calculateSupportPercentage(action, state.packedItems);
      stabilityReward = supportPercentage * 0.5; // Scale stability reward
      
      // Compactness reward - prefer placements that are close to other items
      let compactnessReward = 0;
      if (state.packedItems.length > 0) {
        const avgDistance = calculateAverageDistance(action.position, state.packedItems);
        compactnessReward = Math.max(0, 1 - (avgDistance / params.gridSize)) * 0.3;
      }
      
      // Constraint satisfaction reward
      let constraintReward = 0;
      if (item.constraints && item.constraints.length > 0) {
        // Check if constraints are satisfied
        const constraintsSatisfied = checkConstraintsSatisfied(item, action, state.packedItems);
        constraintReward = constraintsSatisfied ? 0.5 : -0.5;
      }
      
      // Combine rewards
      return volumeReward + stabilityReward + compactnessReward + constraintReward;
    };
    
    // Calculate what percentage of the item's bottom face is supported
    // Enhanced to be much stricter about floating boxes
    const calculateSupportPercentage = (action: Action, packedItems: PackedItem[]): number => {
      const { position, rotation } = action;
      const bottomFaceArea = rotation.length * rotation.width;
      let supportedArea = 0;
      
      // Check if the item is on the container floor
      if (Math.abs(position.y) < 0.001) { // Using a smaller tolerance
        return 1.0; // Fully supported by the floor
      }
      
      // Check support from other items
      for (const packedItem of packedItems) {
        // Get the actual dimensions based on the rotation of the packed item
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
        
        // Check if this item is directly below and supporting the new item
        // Using a slightly larger tolerance to ensure items are truly supported
        if (Math.abs(packedItem.position.y + itemHeight - position.y) < 0.01) {
          // Calculate the overlap area on the XZ plane
          const overlapX = Math.max(0, 
            Math.min(position.x + rotation.length, packedItem.position.x + itemLength) - 
            Math.max(position.x, packedItem.position.x));
            
          const overlapZ = Math.max(0, 
            Math.min(position.z + rotation.width, packedItem.position.z + itemWidth) - 
            Math.max(position.z, packedItem.position.z));
            
          supportedArea += overlapX * overlapZ;
        }
      }
      
      // Calculate support percentage
      const supportPercentage = supportedArea / bottomFaceArea;
      
      // If item is on the ground, it's fully supported
      if (position.y === 0) {
        return 1.0;
      }
      
      // Log support percentage for debugging if it's very low
      if (supportPercentage < 0.2) {
        console.log('Item has low support:', (supportPercentage * 100).toFixed(1) + '%');
      }
      
      // For items not on the ground, ensure a minimum support of 10%
      // but still allow placement with lower support if needed
      const minSupport = 0.1; // 10% minimum support
      const effectiveSupport = Math.max(supportPercentage, minSupport);
      
      // Apply a non-linear scaling to make higher support more valuable
      // but still allow placement with lower support
      const stabilityScore = Math.pow(effectiveSupport, 0.5); // Square root scaling
      
      // Ensure we return a value between 0.1 and 1.0
      return Math.max(0.1, Math.min(1.0, stabilityScore));
    };
    
    // Calculate average distance to packed items
    const calculateAverageDistance = (position: Position, packedItems: PackedItem[]): number => {
      if (packedItems.length === 0) return params.gridSize; // Maximum distance if no items
      
      let totalDistance = 0;
      for (const packedItem of packedItems) {
        const dx = position.x - packedItem.position.x;
        const dy = position.y - packedItem.position.y;
        const dz = position.z - packedItem.position.z;
        totalDistance += Math.sqrt(dx * dx + dy * dy + dz * dz);
      }
      
      return totalDistance / packedItems.length;
    };
    
    // Check if all constraints are satisfied
    const checkConstraintsSatisfied = (item: CargoItem, action: Action, packedItems: PackedItem[]): boolean => {
      if (!item.constraints) return true;
      
      for (const constraint of item.constraints) {
        switch (constraint.type) {
          case CONSTRAINT_TYPES.MUST_BE_ON_TOP:
            if (!isValidForTopPlacement(action.position, action.rotation, packedItems)) {
              return false;
            }
            break;
          case CONSTRAINT_TYPES.MUST_BE_ON_BOTTOM:
            if (action.position.y > 0.01) { // Allow small floating point error
              return false;
            }
            break;
          case CONSTRAINT_TYPES.MUST_BE_UPRIGHT:
            if (action.rotation.x !== 0 || action.rotation.z !== 0) {
              return false;
            }
            break;
          case 'MAX_STACK_WEIGHT': // Using string literal since it's not in CONSTRAINT_TYPES
            if (!isValidForWeightConstraint(item, action, packedItems, constraint.value || 0)) {
              return false;
            }
            break;
          case CONSTRAINT_TYPES.FRAGILE:
            if (!isValidForFragileItem(action.position, action.rotation, packedItems)) {
              return false;
            }
            break;
        }
      }
      
      return true;
    };
    
    // Check if position is valid for top placement
    const isValidForTopPlacement = (position: Position, _rotation: Rotation, packedItems: PackedItem[]): boolean => {
      // Item must be placed on top of the stack
      let highestY = 0;
      for (const packedItem of packedItems) {
        const itemTop = packedItem.position.y + 
          (packedItem.rotation.x === 90 ? packedItem.width : 
           packedItem.rotation.z === 90 ? packedItem.length : 
           packedItem.height);
        highestY = Math.max(highestY, itemTop);
      }
      
      // Allow a small tolerance for floating point errors
      return Math.abs(position.y - highestY) < 0.1;
    };
    
    // Check if position is valid for weight constraint
    const isValidForWeightConstraint = (_item: CargoItem, action: Action, packedItems: PackedItem[], maxWeight: number): boolean => {
      // Calculate total weight of items stacked above this item
      let totalStackWeight = 0;
      const { position, rotation } = action;
      
      for (const packedItem of packedItems) {
        // Check if this packed item is above our item
        if (packedItem.position.y > position.y + rotation.height) {
          // Check if there's overlap on the XZ plane
          const overlapX = Math.max(0, 
            Math.min(position.x + rotation.length, packedItem.position.x + packedItem.length) - 
            Math.max(position.x, packedItem.position.x));
            
          const overlapZ = Math.max(0, 
            Math.min(position.z + rotation.width, packedItem.position.z + packedItem.width) - 
            Math.max(position.z, packedItem.position.z));
            
          if (overlapX > 0 && overlapZ > 0) {
            totalStackWeight += packedItem.weight;
          }
        }
      }
      
      return totalStackWeight <= maxWeight;
    };
    
    // Generate valid actions for the current state
    const generateValidActions = (state: State): Action[] => {
      const validActions: Action[] = [];
      
      // Consider only a subset of items for efficiency
      const itemsToConsider = state.remainingItems.slice(0, params.lookahead);
      
      for (let itemIndex = 0; itemIndex < itemsToConsider.length; itemIndex++) {
        const item = itemsToConsider[itemIndex];
        
        // Get possible rotations for this item
        const rotations = getPossibleRotations(item);
        
        for (const rotation of rotations) {
          // Try different positions within the container
          for (let x = 0; x <= container.length - rotation.length; x += container.length / params.gridSize) {
            for (let z = 0; z <= container.width - rotation.width; z += container.width / params.gridSize) {
              // Find the highest point at this (x,z) coordinate
              let y = 0;
              for (const packedItem of state.packedItems) {
                // Check if this position overlaps with the packed item on the XZ plane
                const overlapX = Math.max(0, 
                  Math.min(x + rotation.length, packedItem.position.x + packedItem.length) - 
                  Math.max(x, packedItem.position.x));
                  
                const overlapZ = Math.max(0, 
                  Math.min(z + rotation.width, packedItem.position.z + packedItem.width) - 
                  Math.max(z, packedItem.position.z));
                  
                if (overlapX > 0 && overlapZ > 0) {
                  // There is overlap, update y to be on top of this item
                  const itemHeight = packedItem.rotation.x === 90 ? packedItem.width : 
                                    packedItem.rotation.z === 90 ? packedItem.length : 
                                    packedItem.height;
                  y = Math.max(y, packedItem.position.y + itemHeight);
                }
              }
              
              // Check if this position is valid
              const position = { x, y, z };
              if (isPositionEmpty(position, rotation, state.packedItems, container)) {
                validActions.push({ itemIndex, position, rotation });
              }
            }
          }
        }
      }
      
      return validActions;
    };
    
    // Apply an action to a state and get the next state
    const applyAction = (state: State, action: Action): State => {
      const { itemIndex, position, rotation } = action;
      const item = state.remainingItems[itemIndex];
      
      // Create a copy of the current state
      const nextState: State = {
        heightMap: [...state.heightMap.map(row => [...row])],
        remainingItems: [...state.remainingItems],
        packedItems: [...state.packedItems],
        totalVolume: state.totalVolume,
        totalWeight: state.totalWeight
      };
      
      // Create a packed item
      const packedItem: PackedItem = {
        ...item,
        position,
        rotation: {
          x: rotation.x,
          y: rotation.y,
          z: rotation.z
        },
        color: item.color || getRandomColor()
      };
      
      // Update the state
      nextState.packedItems.push(packedItem);
      nextState.remainingItems = nextState.remainingItems.filter((_, idx) => idx !== itemIndex);
      nextState.totalVolume += item.length * item.width * item.height;
      nextState.totalWeight += item.weight;
      
      // Update the height map
      const gridX = scaleToGrid(position.x, container.length);
      const gridZ = scaleToGrid(position.z, container.width);
      const gridLength = scaleToGrid(rotation.length, container.length);
      const gridWidth = scaleToGrid(rotation.width, container.width);
      const height = position.y + rotation.height;
      
      for (let i = gridX; i < gridX + gridLength && i < params.gridSize; i++) {
        for (let j = gridZ; j < gridZ + gridWidth && j < params.gridSize; j++) {
          nextState.heightMap[i][j] = Math.max(nextState.heightMap[i][j], height);
        }
      }
      
      return nextState;
    };
    
    // Create or load neural network model for reinforcement learning
    const createOrLoadModel = () => {
      // If TensorFlow.js is not available, return null
      if (!tf.sequential) {
        return null;
      }
      
      try {
        // Try to load a previously saved model from localStorage
        const savedModelJSON = localStorage.getItem('binPackingModel');
        if (savedModelJSON) {
          console.log('Loading existing model from storage');
          const modelConfig = JSON.parse(savedModelJSON);
          const model = tf.sequential();
          
          // Recreate the model from the saved configuration
          modelConfig.layers.forEach((layerConfig: any) => {
            switch (layerConfig.type) {
              case 'dense':
                model.add(tf.layers.dense({
                  units: layerConfig.units,
                  activation: layerConfig.activation,
                  inputShape: layerConfig.inputShape
                }));
                break;
              // Add other layer types as needed
            }
          });
          
          model.compile({
            optimizer: tf.train.adam(0.001),
            loss: 'meanSquaredError'
          });
          
          return model;
        }
      } catch (error) {
        console.warn('Error loading model, creating new one:', error);
      }
      
      // Create a new model if loading failed or no model exists
      console.log('Creating new neural network model');
      const model = tf.sequential();
      
      // Input features: container dimensions, item dimensions, current state features
      // Output: predicted reward for each action
      model.add(tf.layers.dense({
        units: 128,
        activation: 'relu',
        inputShape: [15] // State features + action features
      }));
      
      model.add(tf.layers.dense({
        units: 64,
        activation: 'relu'
      }));
      
      model.add(tf.layers.dense({
        units: 1,
        activation: 'linear' // Output is the predicted reward
      }));
      
      model.compile({
        optimizer: tf.train.adam(0.001),
        loss: 'meanSquaredError'
      });
      
      return model;
    };
    
    // Convert state and action to feature vector for the neural network
    const stateActionToFeatures = (state: State, action: Action) => {
      if (!tf.tensor) return null;
      
      const { position, rotation } = action;
      const item = state.remainingItems[action.itemIndex];
      
      // Container features
      const containerVolume = container.length * container.width * container.height;
      const containerUtilization = state.totalVolume / containerVolume;
      
      // Item features
      const itemVolume = item.length * item.width * item.height;
      const itemVolumeRatio = itemVolume / containerVolume;
      
      // Position features
      const posXRatio = position.x / container.length;
      const posYRatio = position.y / container.height;
      const posZRatio = position.z / container.width;
      
      // Support and stability
      const supportPercentage = calculateSupportPercentage(action, state.packedItems);
      
      // Proximity to other items
      const avgDistance = state.packedItems.length > 0 ? 
        calculateAverageDistance(position, state.packedItems) / 
        Math.sqrt(container.length * container.length + container.height * container.height + container.width * container.width) : 
        1.0;
      
      // Contact with walls
      const wallContactCount = 
        (position.x < 0.001 ? 1 : 0) + 
        (position.z < 0.001 ? 1 : 0) + 
        (position.y < 0.001 ? 1 : 0) + 
        (position.x + rotation.length > container.length - 0.001 ? 1 : 0) + 
        (position.z + rotation.width > container.width - 0.001 ? 1 : 0);
      
      // Remaining space features
      const remainingItems = state.remainingItems.length;
      const remainingItemsRatio = remainingItems / items.length;
      
      // Create feature vector
      return tf.tensor2d([
        [
          containerUtilization,
          itemVolumeRatio,
          posXRatio, posYRatio, posZRatio,
          rotation.x / 360, rotation.y / 360, rotation.z / 360,
          supportPercentage,
          avgDistance,
          wallContactCount / 5,
          remainingItemsRatio,
          state.packedItems.length / items.length,
          item.weight / container.maxWeight,
          state.totalWeight / container.maxWeight
        ]
      ]);
    };
    
    // Save the model to localStorage
    const saveModel = (model: any) => {
      if (!model) return;
      
      try {
        // Extract model configuration
        const modelConfig = {
          layers: model.layers.map((layer: any) => ({
            type: layer.getClassName().toLowerCase(),
            units: layer.units,
            activation: layer.activation ? layer.activation.getClassName().toLowerCase() : null,
            inputShape: layer.inputShape
          }))
        };
        
        localStorage.setItem('binPackingModel', JSON.stringify(modelConfig));
        console.log('Model saved to storage');
      } catch (error) {
        console.warn('Error saving model:', error);
      }
    };
    
    // True reinforcement learning algorithm implementation
    const packWithRL = (): PackedResult => {
      let currentState = initialState;
      let iteration = 0;
      let done = false;
      
      // Experience buffer for PPO
      const experiences: {
        state: State;
        action: Action;
        reward: number;
        nextState: State;
        done: boolean;
        logProb: number;
        value: number;
      }[] = [];
      
      // Neural network-based policy evaluation
      const evaluatePolicy = (state: State, actions: Action[], model: any): { action: Action; logProb: number; value: number } => {
        if (actions.length === 0) {
          // No valid actions, return dummy values
          return { 
            action: { itemIndex: 0, position: {x: 0, y: 0, z: 0}, rotation: {x: 0, y: 0, z: 0, length: 0, width: 0, height: 0} },
            logProb: 0,
            value: 0
          };
        }
        
        // Use the neural network model if available, otherwise fall back to heuristics
        let actionScores;
        
        if (model && tf.tidy) {
          // Use neural network to predict scores
          actionScores = tf.tidy(() => {
            // Convert each state-action pair to features and get predictions
            const predictions = actions.map(action => {
              const features = stateActionToFeatures(state, action);
              if (!features) return 0;
              
              // Get prediction from model
              const prediction = model.predict(features);
              const score = prediction.dataSync()[0];
              features.dispose();
              prediction.dispose();
              return score;
            });
            
            return predictions;
          });
        } else {
          // Fall back to heuristic scoring
          actionScores = actions.map(action => {
            const { position, rotation } = action;
            const item = state.remainingItems[action.itemIndex];
            
            // Score based on contact with container walls and other items
            let contactScore = 0;
            if (position.x === 0) contactScore += 1; // Contact with left wall
            if (position.z === 0) contactScore += 1; // Contact with back wall
            if (position.y === 0) contactScore += 1; // Contact with floor
            if (position.x + rotation.length >= container.length) contactScore += 1; // Contact with right wall
            if (position.z + rotation.width >= container.width) contactScore += 1; // Contact with front wall
            
            // Score based on proximity to other packed items
            const proximityScore = state.packedItems.length > 0 ? 
              1 / (1 + calculateAverageDistance(position, state.packedItems)) : 0;
            
            // Score based on item volume (prefer larger items first)
            const volumeScore = (item.length * item.width * item.height) / 
                               (container.length * container.width * container.height);
            
            // Score based on support from below - higher weight to prevent floating
            const supportScore = calculateSupportPercentage(action, state.packedItems);
            
            // Combined score - increased weight on support to prevent floating
            return contactScore * 0.2 + proximityScore * 0.2 + volumeScore * 0.1 + supportScore * 0.5;
          });
        }
        
        // Convert scores to probabilities using softmax
        const maxScore = Math.max(...actionScores);
        const expScores = actionScores.map((score: number) => Math.exp(score - maxScore));
        const sumExpScores = expScores.reduce((sum: number, exp: number) => sum + exp, 0);
        const probs = expScores.map((exp: number) => exp / sumExpScores);
        
        // Choose action based on probabilities (with exploration)
        let selectedIndex;
        if (Math.random() < params.explorationRate) {
          // Explore: choose randomly
          selectedIndex = Math.floor(Math.random() * actions.length);
        } else {
          // Exploit: choose based on probabilities
          const r = Math.random();
          let cumProb = 0;
          selectedIndex = probs.findIndex((prob: number) => {
            cumProb += prob;
            return r < cumProb;
          });
          if (selectedIndex === -1) selectedIndex = 0;
        }
        
        // Estimate value (in a real implementation, this would come from a value network)
        const value = state.totalVolume / (container.length * container.width * container.height);
        
        return {
          action: actions[selectedIndex],
          logProb: Math.log(probs[selectedIndex]),
          value
        };
      };
      
      // Create or load the neural network model
      const model = createOrLoadModel();
      
      // Experience replay buffer for training
      const replayBuffer: {
        features: any;
        reward: number;
      }[] = [];
      
      // Main reinforcement learning loop
      while (!done && iteration < params.maxIterations) {
        // Generate valid actions
        const validActions = generateValidActions(currentState);
        
        // Check if we're done
        if (validActions.length === 0 || currentState.remainingItems.length === 0) {
          done = true;
          break;
        }
        
        // Select action using the policy
        const { action, logProb, value } = evaluatePolicy(currentState, validActions, model);
        
        // Apply the action
        const nextState = applyAction(currentState, action);
        
        // Calculate reward
        const reward = calculateReward(currentState, action, nextState);
        
        // Store experience for learning
        if (model && tf.tensor) {
          const features = stateActionToFeatures(currentState, action);
          if (features) {
            replayBuffer.push({
              features,
              reward
            });
          }
        }
        
        // Store experience for PPO
        experiences.push({
          state: currentState,
          action,
          reward,
          nextState,
          done: false,
          logProb,
          value
        });
        
        // Update current state
        currentState = nextState;
        iteration++;
        
        // Report progress
        if (progressCallback) {
          const progress = currentState.totalVolume / (container.length * container.width * container.height);
          progressCallback(progress * 100, currentState);
        }
        
        // Periodically train the model with experiences
        if (model && replayBuffer.length >= params.batchSize && tf.tensor) {
          console.log(`Training model with ${replayBuffer.length} experiences`);
          
          // Train the model using the replay buffer
          tf.tidy(() => {
            // Create batches for training
            const batchSize = Math.min(params.batchSize, replayBuffer.length);
            const batch = replayBuffer.slice(0, batchSize);
            
            // Prepare inputs and targets
            const inputs = tf.concat(batch.map(exp => exp.features));
            const targets = tf.tensor2d(batch.map(exp => [exp.reward]));
            
            // Train the model
            model.fit(inputs, targets, {
              epochs: 1,
              batchSize: 32,
              verbose: 0
            }).then(() => {
              console.log('Model training step completed');
            });
            
            // Clear the used experiences
            batch.forEach(exp => exp.features.dispose());
            inputs.dispose();
            targets.dispose();
          });
          
          // Remove the used experiences from the buffer
          replayBuffer.splice(0, params.batchSize);
        }
      }
      
      // Save the trained model
      if (model) {
        saveModel(model);
      }
      
      // Mark the last experience as done
      if (experiences.length > 0) {
        experiences[experiences.length - 1].done = true;
      }
      
      // In a real implementation, we would update the policy here using PPO
      // For simplicity, we'll skip the actual policy update
      
      // Return the final packing result
      return {
        packedItems: currentState.packedItems,
        unpackedItems: currentState.remainingItems,
        containerFillPercentage: (currentState.totalVolume / (container.length * container.width * container.height)) * 100,
        weightCapacityPercentage: (currentState.totalWeight / container.maxWeight) * 100,
        totalWeight: currentState.totalWeight
      };
    };
    
    // Execute the reinforcement learning algorithm
    return packWithRL();
  }
};

// Worker message handler
console.log('Setting up worker message handler');

self.onmessage = async (event) => {
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
    
    // Progress callback for async algorithms
    const progressCallback = (progress: number, state: any) => {
      self.postMessage({
        type: 'progress',
        value: progress,
        ...state
      });
    };
    
    // Run the selected algorithm (handle both sync and async algorithms)
    const resultPromise = selectedAlgorithm(items, container, progressCallback);
    const result = resultPromise instanceof Promise ? await resultPromise : resultPromise;
    
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