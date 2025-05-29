// Reinforcement Learning Packer using the JavaScript implementation of the k=5.h5 model
// Define the interface for the DeepPack3DModel to fix TypeScript errors
interface IDeepPack3DModel {
  loadModel(): Promise<boolean>;
  predict(constIn: number[][][], hmapIn: number[][][], amapIn: number[][][], imapIn: number[][][]): number;
}

// Import the model with a type assertion
// @ts-ignore - Ignore the module resolution error
import DeepPack3DModelImport from '../../public/models/bin_packing_model/DeepPack3DModel.js';

// Create a singleton instance of the model with proper typing
const deepPackModel: IDeepPack3DModel = new (DeepPack3DModelImport as any)();

// Flask server URL for model predictions - this is the pre-trained model server
const MODEL_SERVER_URL = 'http://localhost:5001';

// Debug flag to track packing process
const DEBUG_PACKING = true;

// Preference flags for model usage
const USE_PRETRAINED_MODEL = true; // Set to true to prioritize the pre-trained model

// Define interfaces for the bin packing model
interface Position {
  x: number;
  y: number;
  z: number;
}

interface Rotation {
  x: number;
  y: number;
  z: number;
  length: number;
  width: number;
  height: number;
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
  constraints?: { type: string; value?: number }[];
}

interface PackedItem extends CargoItem {
  position: Position;
  rotation: Rotation;
}

interface PackedResult {
  packedItems: PackedItem[];
  unpackedItems: CargoItem[];
  containerFillPercentage: number;
  weightCapacityPercentage: number;
  totalWeight: number;
}

// Helper function to get a random color
const getRandomColor = (): string => {
  const letters = '0123456789ABCDEF';
  let color = '#';
  for (let i = 0; i < 6; i++) {
    color += letters[Math.floor(Math.random() * 16)];
  }
  return color;
};

// Helper function to get possible rotations for an item
const getPossibleRotations = (item: CargoItem): Rotation[] => {
  const rotations: Rotation[] = [];

  // Check if item must be upright (non-rotatable)
  const mustBeUpright = item.constraints?.some(c => c.type === 'MUST_BE_UPRIGHT');
  
  if (mustBeUpright) {
    // Only allow upright orientation
    rotations.push({
      x: 0,
      y: 0,
      z: 0,
      length: item.length,
      width: item.width,
      height: item.height
    });
    return rotations;
  }

  // All possible rotations (6 orientations)
  // Original orientation
  rotations.push({
    x: 0,
    y: 0,
    z: 0,
    length: item.length,
    width: item.width,
    height: item.height
  });

  // Rotate 90 degrees around Y axis
  rotations.push({
    x: 0,
    y: 90,
    z: 0,
    length: item.width,
    width: item.length,
    height: item.height
  });

  // Rotate 90 degrees around X axis
  rotations.push({
    x: 90,
    y: 0,
    z: 0,
    length: item.length,
    width: item.height,
    height: item.width
  });

  // Rotate 90 degrees around Z axis
  rotations.push({
    x: 0,
    y: 0,
    z: 90,
    length: item.height,
    width: item.width,
    height: item.length
  });

  // Rotate 90 degrees around X and Y axes
  rotations.push({
    x: 90,
    y: 90,
    z: 0,
    length: item.width,
    width: item.height,
    height: item.length
  });

  // Rotate 90 degrees around Y and Z axes
  rotations.push({
    x: 0,
    y: 90,
    z: 90,
    length: item.height,
    width: item.length,
    height: item.width
  });

  return rotations;
};

// Helper function to check if a position is empty
const isPositionEmpty = (
  position: Position,
  rotation: Rotation,
  packedItems: PackedItem[],
  container: Container
): boolean => {
  // Add a small safety margin to prevent floating point errors
  const SAFETY_MARGIN = 0.1; // Increased from 0.01 to 1cm for better stability
  
  // Check if the item is strictly within the container boundaries
  // No negative safety margin - boxes must be fully inside the container
  if (
    position.x < 0 || 
    position.x + rotation.length > container.length ||
    position.y < 0 || 
    position.y + rotation.height > container.height ||
    position.z < 0 || 
    position.z + rotation.width > container.width
  ) {
    return false;
  }
  
  // Check for collisions with other items - use stricter collision detection
  for (const packedItem of packedItems) {
    // Get the actual dimensions of the packed item based on its rotation
    const packedItemLength = packedItem.rotation.length;
    const packedItemWidth = packedItem.rotation.width;
    const packedItemHeight = packedItem.rotation.height;
    
    // Calculate overlap with NO safety margin for collision detection
    // This ensures boxes don't overlap at all
    const overlapX = Math.max(0, 
      Math.min(position.x + rotation.length, packedItem.position.x + packedItemLength) - 
      Math.max(position.x, packedItem.position.x));
      
    const overlapY = Math.max(0, 
      Math.min(position.y + rotation.height, packedItem.position.y + packedItemHeight) - 
      Math.max(position.y, packedItem.position.y));
      
    const overlapZ = Math.max(0, 
      Math.min(position.z + rotation.width, packedItem.position.z + packedItemWidth) - 
      Math.max(position.z, packedItem.position.z));
    
    // If there's ANY overlap in all three dimensions, there's a collision
    // Using a tiny epsilon value (0.001) to account for floating point precision issues
    const EPSILON = 0.001;
    if (overlapX > EPSILON && overlapY > EPSILON && overlapZ > EPSILON) {
      return false;
    }
  }
  
  return true;
};

// Helper function to generate valid actions with boundary checking
const generateValidActions = (item: CargoItem, packedItems: PackedItem[], container: Container, exhaustiveSearch: boolean = false): { position: Position; rotation: Rotation }[] => {
  // Increase the maximum number of actions to consider more positions
  const MAX_ACTIONS = exhaustiveSearch ? 500 : 300;
  const validActions = [];
  
  // Get possible rotations - ensure we consider all 6 possible orientations
  const rotations = getPossibleRotations(item);
  
  // Use a finer grid for more precise positioning
  // For exhaustive search, use an even finer grid
  const gridStep = exhaustiveSearch ? 
    Math.max(1, Math.min(container.length, container.width) / 40) : 
    Math.max(1, Math.min(container.length, container.width) / 30);
  
  // Try each rotation
  for (const rotation of rotations) {
    // Try different positions with grid stepping
    // Use smaller steps for more precise positioning
    for (let x = 0; x <= container.length - rotation.length; x += gridStep) {
      for (let z = 0; z <= container.width - rotation.width; z += gridStep) {
        // Find the lowest valid y-coordinate at this (x,z) position
        let y = 0;
        let foundSupport = false;
        
        // Check for support from items below
        for (const packedItem of packedItems) {
          // Check if this position overlaps with the packed item on the XZ plane
          const overlapX = Math.max(0, 
            Math.min(x + rotation.length, packedItem.position.x + packedItem.rotation.length) - 
            Math.max(x, packedItem.position.x));
            
          const overlapZ = Math.max(0, 
            Math.min(z + rotation.width, packedItem.position.z + packedItem.rotation.width) - 
            Math.max(z, packedItem.position.z));
          
          // Calculate the overlap area as a percentage of the item's base area
          const overlapArea = overlapX * overlapZ;
          const itemBaseArea = rotation.length * rotation.width;
          const overlapRatio = overlapArea / itemBaseArea;
          
          if (overlapX > 0 && overlapZ > 0) {
            // There is overlap, update y to be on top of this item
            const newY = packedItem.position.y + packedItem.rotation.height;
            
            // If we have significant support (>30% of base area), mark as found support
            if (overlapRatio > 0.3) {
              foundSupport = true;
            }
            
            // Update to the highest supporting surface
            if (newY > y) {
              y = newY;
            }
          }
        }
        
        // For items not on the ground, ensure they have some support
        // Skip positions with insufficient support unless in exhaustive search mode
        if (y > 0 && !foundSupport && !exhaustiveSearch) {
          continue;
        }
        
        // Check if this position is valid
        const position = { x, y, z };
        if (isPositionEmpty(position, rotation, packedItems, container)) {
          // Include all valid positions
          validActions.push({ position, rotation });
          
          // Limit the number of actions to prevent excessive computation
          if (validActions.length >= MAX_ACTIONS) {
            // Sort actions by y-coordinate (prefer lower positions)
            validActions.sort((a, b) => a.position.y - b.position.y);
            return validActions.slice(0, MAX_ACTIONS);
          }
        }
      }
    }
  }
  
  // Sort actions by y-coordinate (prefer lower positions)
  validActions.sort((a, b) => a.position.y - b.position.y);
  return validActions;
};

// Helper function to calculate stability score (0-1) with stricter requirements
const calculateStabilityScore = (position: Position, rotation: Rotation, packedItems: PackedItem[]): number => {
  // If the item is on the ground, it's fully supported
  if (position.y === 0) {
    return 1.0;
  }
  
  // Calculate the bottom face area of the item
  const bottomFaceArea = rotation.length * rotation.width;
  
  // If there are no items below, the item is floating
  if (packedItems.length === 0) {
    return 0.0;
  }
  
  if (DEBUG_PACKING) console.log(`[RL PACKER] Checking stability for item at (${position.x}, ${position.y}, ${position.z}) - L:${rotation.length}, W:${rotation.width}, H:${rotation.height}`);
  
  // Calculate how much of the bottom face is supported by other items
  let supportedArea = 0;
  let maxSupportHeight = 0;
  let supportingItems = 0;
  
  // Check each packed item to see if it supports this item
  for (const packedItem of packedItems) {
    // More lenient check - items that are within 0.5 units of expected height
    // This helps with floating point imprecision
    const supportTolerance = 0.5; // 5mm tolerance for support
    
    // Calculate the top of the potential supporting item
    const supportingItemTop = packedItem.position.y + packedItem.rotation.height;
    
    // Check if the packed item is at the right height to provide support
    const isAtSupportHeight = Math.abs(supportingItemTop - position.y) <= supportTolerance;
    
    if (!isAtSupportHeight) {
      if (DEBUG_PACKING) console.log(`[RL PACKER] Item at Y=${supportingItemTop} not close enough to current item base at Y=${position.y}`);
      continue;
    }
    
    // Calculate the overlapping area
    const overlapX = Math.max(0, 
      Math.min(position.x + rotation.length, packedItem.position.x + packedItem.rotation.length) - 
      Math.max(position.x, packedItem.position.x));
      
    const overlapZ = Math.max(0, 
      Math.min(position.z + rotation.width, packedItem.position.z + packedItem.rotation.width) - 
      Math.max(position.z, packedItem.position.z));
      
    // Only count if there's actual overlap in both dimensions
    if (overlapX > 0 && overlapZ > 0) {
      // Add the overlapping area to the supported area
      const itemSupportArea = overlapX * overlapZ;
      supportedArea += itemSupportArea;
      maxSupportHeight = Math.max(maxSupportHeight, supportingItemTop);
      supportingItems++;
      
      if (DEBUG_PACKING) console.log(`[RL PACKER] Found supporting item: overlap area = ${itemSupportArea.toFixed(2)} units²`);
    }
  }
  
  // Calculate the percentage of the bottom face that is supported
  const supportPercentage = supportedArea / bottomFaceArea;
  
  // Even more lenient stability requirements for the reinforcement learning packer
  // 1. For the first item, almost no support is required (just to get started)
  // 2. For small items, 30% support is sufficient
  // 3. For larger items, 40% support is required or at least 2 supporting items
  // 4. Progressive thresholds based on packing progress
  
  const isFirstItem = packedItems.length === 0;
  const isSecondItem = packedItems.length === 1;
  const isEarlyStage = packedItems.length < 3;
  const isLargeItem = bottomFaceArea > 400; // Consider items with area > 400 sq cm as large
  
  // Progressive stability requirements - much more lenient now
  let stabilityThreshold = 0.4; // Default 40% support required (down from 50%)
  
  // Very lenient for early items to start the packing process
  if (isFirstItem) stabilityThreshold = 0.01; // Almost no support for first item
  else if (isSecondItem) stabilityThreshold = 0.2; // 20% for second item
  else if (isEarlyStage) stabilityThreshold = 0.3; // 30% for early stage
  else if (!isLargeItem) stabilityThreshold = 0.3; // 30% for small items
  
  // Additional debug information
  if (DEBUG_PACKING) {
    console.log(`[RL PACKER] Stability analysis: ${supportPercentage.toFixed(4)} (${supportedArea.toFixed(2)}/${bottomFaceArea.toFixed(2)} supported)`);
    console.log(`[RL PACKER] Supporting items: ${supportingItems}, Required threshold: ${stabilityThreshold}`);
  }
  
  // For very little support, return 0
  if (supportPercentage < 0.1) {
    if (DEBUG_PACKING) console.log(`[RL PACKER] Extremely low stability (${supportPercentage.toFixed(2)}), failing stability check`);
    return 0.0;
  }
  
  // For larger items, require at least 2 supporting points unless first few items
  const hasEnoughSupports = !isLargeItem || supportingItems >= 2 || isFirstItem || isSecondItem;
  
  // If doesn't meet threshold, return low score but not zero to allow fallbacks
  if (supportPercentage < stabilityThreshold || !hasEnoughSupports) {
    if (DEBUG_PACKING) console.log(`[RL PACKER] Below stability threshold (${supportPercentage.toFixed(2)} < ${stabilityThreshold}), returning low score`);
    return 0.2; // Low score but not zero to allow fallbacks
  }
  
  // Normalize the score between 0.5 and 1.0 based on support percentage
  return 0.5 + (supportPercentage * 0.5);
};

// Helper function to calculate space utilization score (0-1)
const calculateSpaceUtilizationScore = (position: Position, rotation: Rotation, packedItems: PackedItem[], container: Container): number => {
  // Calculate volume of the item
  const itemVolume = rotation.length * rotation.width * rotation.height;
  
  // Calculate container volume
  const containerVolume = container.length * container.width * container.height;
  
  // Calculate current filled volume (excluding this item)
  let filledVolume = 0;
  for (const packedItem of packedItems) {
    filledVolume += packedItem.rotation.length * packedItem.rotation.width * packedItem.rotation.height;
  }
  
  // Calculate how much this placement contributes to overall container utilization
  const utilizationContribution = itemVolume / containerVolume;
  
  // Calculate how well this placement fits with existing items
  // Lower y-coordinate is better (less wasted space below)
  const heightScore = 1 - (position.y / container.height);
  
  // Combine scores
  return 0.7 * utilizationContribution + 0.3 * heightScore;
};

// Helper function to calculate compactness score (0-1)
const calculateCompactnessScore = (position: Position, rotation: Rotation, packedItems: PackedItem[], container: Container): number => {
  if (packedItems.length === 0) {
    // For first item, prefer corner placement
    const cornerDistance = Math.min(
      Math.sqrt(position.x * position.x + position.y * position.y + position.z * position.z),
      Math.sqrt((container.length - position.x - rotation.length) * (container.length - position.x - rotation.length) + 
                position.y * position.y + 
                position.z * position.z),
      Math.sqrt(position.x * position.x + position.y * position.y + 
                (container.width - position.z - rotation.width) * (container.width - position.z - rotation.width)),
      Math.sqrt((container.length - position.x - rotation.length) * (container.length - position.x - rotation.length) + 
                position.y * position.y + 
                (container.width - position.z - rotation.width) * (container.width - position.z - rotation.width))
    );
    
    // Normalize by container diagonal
    const containerDiagonal = Math.sqrt(container.length * container.length + container.height * container.height + container.width * container.width);
    return 1 - (cornerDistance / containerDiagonal);
  }
  
  // Calculate average distance to other items (closer is better)
  let totalDistance = 0;
  const itemCenter = {
    x: position.x + rotation.length / 2,
    y: position.y + rotation.height / 2,
    z: position.z + rotation.width / 2
  };
  
  for (const packedItem of packedItems) {
    const packedItemCenter = {
      x: packedItem.position.x + packedItem.rotation.length / 2,
      y: packedItem.position.y + packedItem.rotation.height / 2,
      z: packedItem.position.z + packedItem.rotation.width / 2
    };
    
    // Calculate Euclidean distance
    const distance = Math.sqrt(
      Math.pow(itemCenter.x - packedItemCenter.x, 2) +
      Math.pow(itemCenter.y - packedItemCenter.y, 2) +
      Math.pow(itemCenter.z - packedItemCenter.z, 2)
    );
    
    totalDistance += distance;
  }
  
  // Average distance
  const avgDistance = totalDistance / packedItems.length;
  
  // Normalize by container diagonal
  const containerDiagonal = Math.sqrt(container.length * container.length + container.height * container.height + container.width * container.width);
  
  // Inverse relationship: closer items = higher score
  return 1 - Math.min(1, avgDistance / (containerDiagonal / 2));
};

// Helper functions for model input preparation with improved precision
// Increased grid size for better resolution and more accurate height mapping
function createHeightMap(container: Container, packedItems: PackedItem[]): number[][] {
  // Create a 64x64 grid representing the height at each position for better precision
  const gridSize = 64;
  const heightMap = Array(gridSize).fill(0).map(() => Array(gridSize).fill(0));
  
  // Fill height map based on packed items with improved precision
  packedItems.forEach(item => {
    // Calculate grid coordinates with better precision
    const x = Math.floor((item.position.x / container.length) * gridSize);
    const z = Math.floor((item.position.z / container.width) * gridSize);
    const width = Math.ceil((item.rotation.length / container.length) * gridSize);
    const depth = Math.ceil((item.rotation.width / container.width) * gridSize);
    const height = item.position.y + item.rotation.height;
    
    // Add height information with anti-aliasing for smoother transitions
    for (let i = Math.max(0, x-1); i < Math.min(gridSize, x + width + 1); i++) {
      for (let j = Math.max(0, z-1); j < Math.min(gridSize, z + depth + 1); j++) {
        // Core area gets full height
        if (i >= x && i < x + width && j >= z && j < z + depth) {
          heightMap[j][i] = Math.max(heightMap[j][i], height / container.height);
        } 
        // Border areas get gradient for smoother transitions
        else {
          // Calculate distance from border (0 = on border, 1 = one cell away)
          const borderDist = Math.min(
            Math.abs(i - x), 
            Math.abs(i - (x + width - 1)),
            Math.abs(j - z),
            Math.abs(j - (z + depth - 1))
          );
          
          // Apply gradient based on distance (closer = higher value)
          if (borderDist <= 1) {
            const gradientHeight = (height / container.height) * (1 - borderDist * 0.8);
            heightMap[j][i] = Math.max(heightMap[j][i], gradientHeight);
          }
        }
      }
    }
  });
  
  return heightMap;
}

function createActionMap(container: Container, position: Position, rotation: Rotation, heightMap: number[][]): number[][] {
  // Validate position and rotation to prevent boundary violations
  if (position.x < 0 || position.y < 0 || position.z < 0 ||
      position.x + rotation.length > container.length ||
      position.y + rotation.height > container.height ||
      position.z + rotation.width > container.width) {
    console.warn('Boundary violation in createActionMap:', position, rotation, container);
    // Return a copy of the height map as fallback
    return JSON.parse(JSON.stringify(heightMap));
  }

  // Use same grid size as heightMap for consistency
  const gridSize = heightMap.length;
  const actionMap = JSON.parse(JSON.stringify(heightMap));
  
  // Calculate grid coordinates with consistent scaling
  const x = Math.floor((position.x / container.length) * gridSize);
  const z = Math.floor((position.z / container.width) * gridSize);
  const width = Math.ceil((rotation.length / container.length) * gridSize);
  const depth = Math.ceil((rotation.width / container.width) * gridSize);
  const height = (position.y + rotation.height) / container.height;
  
  // Mark the action area with the height value
  for (let i = x; i < x + width && i < gridSize; i++) {
    for (let j = z; j < z + depth && j < gridSize; j++) {
      if (i >= 0 && j >= 0 && i < gridSize && j < gridSize) {
        actionMap[j][i] = height;
      }
    }
  }
  
  // Add gradient information for better positioning cues
  const gradient = 0.05; // Subtle gradient to help with positioning
  for (let i = 0; i < gridSize; i++) {
    for (let j = 0; j < gridSize; j++) {
      // Skip cells that are part of the action area
      if (i >= x && i < x + width && j >= z && j < z + depth) {
        continue;
      }
      
      // Calculate distance from action center
      const centerX = x + width/2;
      const centerZ = z + depth/2;
      const distance = Math.sqrt(Math.pow(i - centerX, 2) + Math.pow(j - centerZ, 2));
      
      // Apply subtle gradient (closer = higher value)
      const gradientValue = Math.max(0, gradient - (distance / gridSize) * gradient);
      
      // Only add gradient to empty or lower cells
      if (actionMap[j][i] < height - 0.01) {
        actionMap[j][i] += gradientValue;
      }
    }
  }
  
  return actionMap;
}

// Create a more informative constraint map that provides meaningful container constraints
function createConstraintMap(container: Container, packedItems: PackedItem[]): number[][] {
  const gridSize = 64; // Same as heightMap for consistency
  const constMap = Array(gridSize).fill(0).map(() => Array(gridSize).fill(1)); // Initialize with 1 (available space)
  
  // Mark container boundaries with special values
  for (let i = 0; i < gridSize; i++) {
    for (let j = 0; j < gridSize; j++) {
      // Mark edges of container
      if (i === 0 || j === 0 || i === gridSize-1 || j === gridSize-1) {
        constMap[j][i] = 0.8; // Boundary marker
      }
    }
  }
  
  // Mark occupied areas with packed items (top-down view)
  packedItems.forEach(item => {
    const x = Math.floor((item.position.x / container.length) * gridSize);
    const z = Math.floor((item.position.z / container.width) * gridSize);
    const width = Math.ceil((item.rotation.length / container.length) * gridSize);
    const depth = Math.ceil((item.rotation.width / container.width) * gridSize);
    
    for (let i = x; i < x + width && i < gridSize; i++) {
      for (let j = z; j < z + depth && j < gridSize; j++) {
        if (i >= 0 && j >= 0 && i < gridSize && j < gridSize) {
          constMap[j][i] = 0.2; // Occupied space marker
        }
      }
    }
  });
  
  // Add center of gravity information
  if (packedItems.length > 0) {
    // Calculate current center of gravity
    let totalWeight = 0;
    let weightedX = 0;
    let weightedZ = 0;
    
    packedItems.forEach(item => {
      const itemCenterX = item.position.x + item.rotation.length/2;
      const itemCenterZ = item.position.z + item.rotation.width/2;
      weightedX += itemCenterX * item.weight;
      weightedZ += itemCenterZ * item.weight;
      totalWeight += item.weight;
    });
    
    const cogX = weightedX / totalWeight / container.length;
    const cogZ = weightedZ / totalWeight / container.width;
    
    // Add gradient based on distance from center of gravity
    for (let i = 0; i < gridSize; i++) {
      for (let j = 0; j < gridSize; j++) {
        // Skip occupied spaces
        if (constMap[j][i] === 0.2) continue;
        
        // Calculate normalized coordinates
        const normX = i / gridSize;
        const normZ = j / gridSize;
        
        // Distance from center of gravity (normalized 0-1)
        const distance = Math.sqrt(Math.pow(normX - cogX, 2) + Math.pow(normZ - cogZ, 2));
        
        // Apply subtle gradient (further from COG = lower value)
        constMap[j][i] -= Math.min(0.15, distance * 0.3);
      }
    }
  }
  
  return constMap;
}

// Helper function to refine position by lowering items as much as possible (gravity effect)
const refinePosition = (position: Position, rotation: Rotation, packedItems: PackedItem[]): Position => {
  // If already on the ground, no need to refine
  if (position.y === 0) {
    return {
      x: Math.round(position.x * 100) / 100, // Round to 2 decimal places for precision
      y: 0,
      z: Math.round(position.z * 100) / 100
    };
  }
  
  // Find highest point below this position
  let highestPointBelow = 0;
  
  for (const item of packedItems) {
    // Check if item is below our position
    const overlapX = Math.max(0, 
      Math.min(position.x + rotation.length, item.position.x + item.rotation.length) - 
      Math.max(position.x, item.position.x));
    
    const overlapZ = Math.max(0, 
      Math.min(position.z + rotation.width, item.position.z + item.rotation.width) - 
      Math.max(position.z, item.position.z));
    
    // If there's significant overlap in the XZ plane (at least 20% of the smaller dimension)
    // and the item is below, check its height
    const minItemDimension = Math.min(rotation.length, rotation.width);
    const minSupportItemDimension = Math.min(item.rotation.length, item.rotation.width);
    const minDimension = Math.min(minItemDimension, minSupportItemDimension);
    const significantOverlap = (overlapX * overlapZ) > (0.2 * minDimension * minDimension);
    
    if (overlapX > 0 && overlapZ > 0 && significantOverlap) {
      const itemTopY = item.position.y + item.rotation.height;
      if (itemTopY < position.y && itemTopY > highestPointBelow) {
        highestPointBelow = itemTopY;
      }
    }
  }
  
  // Apply a small offset to prevent z-fighting in visualization (0.01 units)
  const VISUAL_OFFSET = 0.01;
  
  // Return refined position with item at the highest point below, with precision rounding
  return { 
    x: Math.round(position.x * 100) / 100, 
    y: Math.round((highestPointBelow + VISUAL_OFFSET) * 100) / 100,
    z: Math.round(position.z * 100) / 100 
  };
};

function createItemMap(remainingItems: CargoItem[], container: Container): number[][] {
  if (!remainingItems || remainingItems.length === 0) {
    // Return empty item map if no items
    return Array(4).fill(0).map(() => Array(5).fill(0));
  }
  // Take up to 4 items (k=5 means current item + 4 future items)
  const items = remainingItems.slice(0, 4);
  
  // Normalize dimensions
  const maxDim = Math.max(container.length, container.width, container.height);
  const maxWeight = container.maxWeight || 1000; // Fallback if maxWeight not specified
  const containerVolume = container.length * container.width * container.height;
  
  // Create enhanced item map with normalized dimensions and additional features
  const itemMap = items.map(item => {
    const volume = item.length * item.width * item.height;
    return [
      item.length / maxDim,                  // Normalized length
      item.height / maxDim,                  // Normalized height
      item.width / maxDim,                   // Normalized width
      item.weight / maxWeight,               // Normalized weight
      volume / containerVolume               // Normalized volume
    ];
  });
  
  // Pad with zeros if less than 4 items
  while (itemMap.length < 4) {
    itemMap.push([0, 0, 0, 0, 0]);
  }
  
  return itemMap;
}

// Main reinforcement learning packing algorithm
const reinforcementLearningPacker = async (
  items: CargoItem[],
  container: Container,
  progressCallback?: (progress: number, state: any) => void
): Promise<PackedResult> => {
  console.log('Using JavaScript implementation of the pre-trained reinforcement learning model (k=5) for bin packing');
  
  // Load the JavaScript model
  let modelLoaded = false;
  // Determine if we should attempt to use the local model at all
  let attemptLocalModel = !USE_PRETRAINED_MODEL;
  
  // Try loading the local model only if we're not prioritizing the pre-trained model
  if (attemptLocalModel) {
    try {
      console.log('[RL PACKER] Loading local DeepPack3D JavaScript model...');
      modelLoaded = await deepPackModel.loadModel();
      if (modelLoaded) {
        console.log('[RL PACKER] Local DeepPack3D model loaded successfully ✅');
      } else {
        console.warn('[RL PACKER] Failed to load local DeepPack3D model, will use Flask server (pre-trained model) ⚠️');
      }
    } catch (error) {
      console.error('[RL PACKER] Error loading local DeepPack3D model:', error);
      console.warn('[RL PACKER] Will use Flask server (pre-trained model) ⚠️');
      modelLoaded = false;
    }
  } else {
    console.log('[RL PACKER] Configured to prioritize pre-trained model via Flask server');
    modelLoaded = false; // Ensure we don't use the local model
  }
  
  // Initialize state
  const packedItems: PackedItem[] = [];
  
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
  
  // Sort items by weight in descending order (heaviest first)
  // This ensures heavier items are placed at the bottom for better stability
  const sortedItems = [...expandedItems].sort((a, b) => {
    // Primary sort: Heaviest items first
    if (Math.abs(b.weight - a.weight) > 0.01) return b.weight - a.weight;
    
    // Secondary sort: Larger volume first (ensures larger boxes are placed first)
    const volumeA = a.length * a.width * a.height;
    const volumeB = b.length * b.width * b.height;
    if (Math.abs(volumeB - volumeA) > 0.01) return volumeB - volumeA;
    
    // Tertiary sort: Larger base area first (better stability)
    const baseAreaA = a.length * a.width;
    const baseAreaB = b.length * b.width;
    return baseAreaB - baseAreaA;
  });
  
  console.log('Items sorted by weight (heaviest first) for better stability');
  
  let remainingItems = [...sortedItems];
  let totalVolume = 0;
  let totalWeight = 0;
  
  // Main packing loop
  while (remainingItems.length > 0) {
    // Report progress
    if (progressCallback) {
      const progress = (items.length > 0) 
        ? ((items.length - remainingItems.length) / items.length) * 100
        : 100;
      progressCallback(progress, {
        packedItems,
        remainingItems,
        totalVolume,
        totalWeight
      });
    }
    
    // Get current item to pack
    const currentItem = remainingItems[0];
    
    // Generate valid positions and rotations
    // First try with normal constraints
    const validActions = generateValidActions(currentItem, packedItems, container);
    
    if (validActions.length === 0) {
      // No valid positions found, try with exhaustive search
      console.warn(`No valid position found for item ${currentItem.id} (${currentItem.name}), trying exhaustive search...`);
      
      // Use exhaustive search with finer grid and more positions
      const exhaustiveActions = generateValidActions(currentItem, packedItems, container, true);
      
      if (exhaustiveActions.length > 0) {
        console.log(`Found ${exhaustiveActions.length} positions with exhaustive search for item ${currentItem.id}`);
        validActions.push(...exhaustiveActions);
      } else {
        // Still no valid positions, try with all possible rotations at all possible positions
        console.warn(`Still no valid positions found for item ${currentItem.id}, trying all rotations...`);
        
        // Try all possible rotations at all possible positions with a very fine grid
        const allRotations = getPossibleRotations(currentItem);
        
        // Try a much finer grid for desperate cases
        const fineGridStep = Math.max(1, Math.min(container.length, container.width) / 60);
        
        // Track if we found any valid position
        let foundValidPosition = false;
        
        // Try each rotation
        for (const rotation of allRotations) {
          // Try different positions with very fine grid stepping
          for (let x = 0; x <= container.length - rotation.length; x += fineGridStep) {
            for (let z = 0; z <= container.width - rotation.width; z += fineGridStep) {
              // Try different heights
              for (let y = 0; y <= container.height - rotation.height; y += 5) {
                // Check if this position is valid
                const position = { x, y, z };
                if (isPositionEmpty(position, rotation, packedItems, container)) {
                  validActions.push({ position, rotation });
                  foundValidPosition = true;
                  
                  // Limit to prevent excessive computation
                  if (validActions.length >= 100) {
                    break;
                  }
                }
              }
              if (foundValidPosition && validActions.length >= 100) break;
            }
            if (foundValidPosition && validActions.length >= 100) break;
          }
          if (foundValidPosition && validActions.length >= 100) break;
        }
        
        // If we still couldn't find a position, try placing on top of the highest item
        if (validActions.length === 0 && packedItems.length > 0) {
          console.warn(`Still no valid positions found for item ${currentItem.id}, trying to place on top of highest item...`);
          
          // Find the item with the highest top surface
          let highestItem = packedItems[0];
          
          for (const packedItem of packedItems) {
            if (packedItem.position.y + packedItem.rotation.height > 
                highestItem.position.y + highestItem.rotation.height) {
              highestItem = packedItem;
            }
          }
          
          // Try all rotations on top of this item
          const topPosition = {
            x: highestItem.position.x,
            y: highestItem.position.y + highestItem.rotation.height,
            z: highestItem.position.z
          };
          
          for (const rotation of allRotations) {
            if (topPosition.y + rotation.height <= container.height &&
                topPosition.x + rotation.length <= container.length &&
                topPosition.z + rotation.width <= container.width &&
                isPositionEmpty(topPosition, rotation, packedItems, container)) {
              validActions.push({ position: topPosition, rotation });
              break;
            }
          }
        }
        
        // If we still couldn't find a position, try one last approach - find any valid position
        if (validActions.length === 0) {
          console.warn(`Last resort for item ${currentItem.id}: trying to find ANY valid position...`);
          
          // Try to find ANY valid position in the container
          for (let y = 0; y <= container.height - currentItem.height; y += 10) {
            for (let x = 0; x <= container.length - currentItem.length; x += 10) {
              for (let z = 0; z <= container.width - currentItem.width; z += 10) {
                const position = { x, y, z };
                for (const rotation of allRotations) {
                  if (isPositionEmpty(position, rotation, packedItems, container)) {
                    validActions.push({ position, rotation });
                    foundValidPosition = true;
                    break;
                  }
                }
                if (foundValidPosition) break;
              }
              if (foundValidPosition) break;
            }
            if (foundValidPosition) break;
          }
        }
        
        // If we still couldn't find a position, skip this item
        if (validActions.length === 0) {
          console.warn(`Item ${currentItem.id} cannot be packed after exhaustive attempts, skipping...`);
          remainingItems.shift();
          continue;
        }
      }
    }
    
    try {
      // Use model to select best action
      let bestAction: { position: Position; rotation: Rotation } | null = null;
      let bestQValue = -Infinity;
      
      // First try to use the Flask server
      try {
        console.log(`[RL PACKER] Packing item ${currentItem.name} (${currentItem.length}x${currentItem.width}x${currentItem.height})`);
        
        // Always try Flask server (pre-trained model) first if configured to do so
        if (USE_PRETRAINED_MODEL) {
          console.log('[RL PACKER] Prioritizing pre-trained model via Flask server');
          try {
            // Enhanced request with more action candidates for the pre-trained model
            // Create a set of action maps for different candidate positions
            const actionMaps = [];
            const numActionCandidates = Math.min(5, validActions.length);
            
            for (let i = 0; i < numActionCandidates; i++) {
              actionMaps.push(
                createActionMap(
                  container, 
                  validActions[i].position, 
                  validActions[i].rotation, 
                  createHeightMap(container, packedItems)
                )
              );
            }
            
            // Create a single height map for the current state
            const heightMap = createHeightMap(container, packedItems);
            
            // Send to Flask server with enhanced request
            console.log(`[RL PACKER] Sending request to Flask server with ${numActionCandidates} action candidates`);
            const response = await fetch(`${MODEL_SERVER_URL}/predict`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                const_in: [Array(32).fill(0).map(() => Array(32).fill(1))],
                hmap_in: [heightMap],
                amap_in: actionMaps,
                imap_in: [createItemMap(remainingItems, container)],
                num_candidates: numActionCandidates
              })
            });
            
            if (!response.ok) {
              throw new Error(`Server responded with status: ${response.status}`);
            }
            console.log('[RL PACKER] Successfully connected to Flask server ✅');
            
            const data = await response.json();
            if (data.status === 'success') {
              console.log('[RL PACKER] Successfully received prediction from pre-trained model ✅');
              
              // CRITICAL FIX: Force items to be placed on the ground for the first few items
              // This ensures we have a stable base to build upon
              if (packedItems.length < 2) {
                console.log('[RL PACKER] Ensuring first items are placed on the ground for stability');
                // Find a valid position on the ground
                for (let i = 0; i < validActions.length; i++) {
                  if (validActions[i].position.y === 0) {
                    bestAction = validActions[i];
                    console.log(`[RL PACKER] Selected ground position: (${bestAction.position.x}, 0, ${bestAction.position.z})`);
                    break;
                  }
                }
                
                // If no ground position found, use the first valid action but force y=0
                if (!bestAction && validActions.length > 0) {
                  bestAction = {
                    ...validActions[0],
                    position: {...validActions[0].position, y: 0}
                  };
                  console.log('[RL PACKER] Forced first item to ground level');
                }
                
                // CRITICAL: Immediately apply this action to pack the item
                if (bestAction) {
                  const { position, rotation } = bestAction;
                  
                  // Create packed item
                  const packedItem: PackedItem = {
                    ...currentItem,
                    position: position,
                    rotation: rotation,
                    color: currentItem.color || getRandomColor()
                  };
                  
                  // Update state
                  packedItems.push(packedItem);
                  remainingItems.shift();
                  totalVolume += rotation.length * rotation.width * rotation.height;
                  totalWeight += currentItem.weight;
                  
                  console.log(`[RL PACKER] Successfully packed first item ${currentItem.name} at (${position.x}, ${position.y}, ${position.z})`);
                  // Skip the rest of the loop for this item
                  continue;
                }
              } else {
                // For subsequent items, use the model prediction
                console.log('[RL PACKER] Using model prediction for placement');
                
                // Check if we have predictions in the response
                if (data.prediction && Array.isArray(data.prediction) && data.prediction.length > 0) {
                  // The prediction contains Q-values for each action candidate
                  const qValues = data.prediction;
                  console.log('[RL PACKER] Q-values received:', qValues);
                  
                  // Find the action with the highest Q-value
                  let bestIndex = 0;
                  let bestQValue = qValues[0];
                  
                  for (let i = 1; i < qValues.length && i < validActions.length; i++) {
                    if (qValues[i] > bestQValue) {
                      bestQValue = qValues[i];
                      bestIndex = i;
                    }
                  }
                  
                  // Select the best action based on the model's prediction
                  bestAction = validActions[bestIndex];
                  console.log(`[RL PACKER] Selected action ${bestIndex} with Q-value ${bestQValue.toFixed(4)}`);
                  console.log(`[RL PACKER] Position: (${bestAction.position.x}, ${bestAction.position.y}, ${bestAction.position.z})`);
                } else {
                  // Fallback if no prediction data
                  console.warn('[RL PACKER] No valid prediction data, using first valid action');
                  bestAction = validActions[0];
                }
              }
              
              // Additional validation of the selected position
              if (bestAction) {
                const position = bestAction.position;
                const rotation = bestAction.rotation;
                
                // Verify the position is valid
                const isValid = position.x >= 0 && 
                               position.y >= 0 && 
                               position.z >= 0 && 
                               position.x + rotation.length <= container.length && 
                               position.y + rotation.height <= container.height && 
                               position.z + rotation.width <= container.width;
                
                console.log(`[RL PACKER] Final position validity check: ${isValid ? 'VALID ✅' : 'INVALID ❌'}`);
                
                if (!isValid) {
                  // Find a safe fallback position
                  console.warn('[RL PACKER] Selected position is invalid, finding fallback...');
                  for (const action of validActions) {
                    const pos = action.position;
                    const rot = action.rotation;
                    if (pos.x >= 0 && pos.y >= 0 && pos.z >= 0 &&
                        pos.x + rot.length <= container.length &&
                        pos.y + rot.height <= container.height &&
                        pos.z + rot.width <= container.width) {
                      bestAction = action;
                      console.log('[RL PACKER] Found valid fallback position');
                      break;
                    }
                  }
                }
              } else {
                console.warn('[RL PACKER] No valid actions available for this item!');
              }
              
              // Success with pre-trained model, continue processing with the selected action
              if (bestAction) {
                console.log('[RL PACKER] Continuing with action selected by pre-trained model');
                break; // Exit the model selection loop and continue with the action
              }
            } else {
              throw new Error('Pre-trained model prediction failed');
            }
          } catch (serverError) {
            console.error('[RL PACKER] Error using pre-trained model via Flask server:', serverError);
            console.warn('[RL PACKER] Falling back to local model or heuristics ⚠️');
            // Continue to try local model as fallback
          }
        }
        
        // Try to use the JavaScript model if loaded and either we're not prioritizing
        // the pre-trained model or the pre-trained model failed
        if (modelLoaded) {
          console.log('[RL PACKER] Using local JavaScript model for prediction');
          // Score and sort actions
          const scoredActions = validActions.map(action => {
            const { position, rotation } = action;
            const stabilityScore = calculateStabilityScore(position, rotation, packedItems);
            const spaceUtilizationScore = calculateSpaceUtilizationScore(position, rotation, packedItems, container);
            const compactnessScore = calculateCompactnessScore(position, rotation, packedItems, container);
            
            // Calculate height score - prefer lower positions for heavier items
            // This ensures heavier items are placed at the bottom
            const heightScore = 1.0 - (position.y / container.height);
            
            // Weight the height score by the item's relative weight
            // Heavier items get stronger preference for lower positions
            const maxWeight = Math.max(...items.map(item => item.weight));
            const weightRatio = currentItem.weight / maxWeight;
            const weightedHeightScore = heightScore * weightRatio * 2.0; // Amplify the effect for heavy items
            
            // Calculate a base score with higher emphasis on stability and weighted height
            let score = (0.4 * stabilityScore) + 
                       (0.2 * spaceUtilizationScore) + 
                       (0.15 * compactnessScore) + 
                       (0.25 * weightedHeightScore); // Significant weight for height score
            
            // Additional bonus for ground positions
            if (position.y === 0) score += 0.5;
            
            // Bonus for positions near walls/corners (for stability)
            const minWallDist = Math.min(
              position.x,
              container.length - (position.x + rotation.length),
              position.z,
              container.width - (position.z + rotation.width)
            );
            
            if (minWallDist < 5) {
              score += (5 - minWallDist) * 0.02; // Small bonus for being near walls
            }
            
            return { action, score };
          });
          
          // Sort by score (descending)
          scoredActions.sort((a, b) => b.score - a.score);
          
          // Only evaluate the top N actions with the model to improve performance
          const TOP_ACTIONS_TO_EVALUATE = Math.min(20, scoredActions.length);
          
          for (let i = 0; i < TOP_ACTIONS_TO_EVALUATE; i++) {
            const { action, score } = scoredActions[i];
            const { position, rotation } = action;
            
            try {
              // Double-check for boundary violations
              if (position.x < 0 || position.y < 0 || position.z < 0 ||
                  position.x + rotation.length > container.length ||
                  position.y + rotation.height > container.height ||
                  position.z + rotation.width > container.width) {
                console.warn('Skipping action due to boundary violation:', position, rotation);
                continue;
              }
              
              // Prepare inputs for the model with improved constraint map
              const constMap = createConstraintMap(container, packedItems);
              const heightMap = createHeightMap(container, packedItems);
              const actionMap = createActionMap(container, position, rotation, heightMap);
              const itemMap = createItemMap(remainingItems, container);
              
              // Get Q-value prediction from model
              const qValue = deepPackModel.predict(
                [constMap],
                [heightMap],
                [actionMap],
                [itemMap]
              );
              
              // Calculate adaptive model weight based on confidence and stability
              const calculateModelWeight = (modelQValue: number, itemStabilityScore: number): number => {
                // If model prediction seems strong and stability is good, trust it more
                if (modelQValue > 0.8 && itemStabilityScore > 0.8) {
                  return 0.9; // High confidence, heavily weight the model
                } else if (modelQValue < 0.3 || itemStabilityScore < 0.5) {
                  return 0.4; // Low confidence or low stability, rely more on heuristics
                }
                return 0.7; // Default weight
              };
              
              // Adaptive weighting based on model confidence and stability
              const modelWeight = calculateModelWeight(qValue, score);
              const combinedScore = (modelWeight * qValue) + ((1 - modelWeight) * score);
              
              console.log(`Item ${currentItem.name} position (${position.x.toFixed(1)},${position.y.toFixed(1)},${position.z.toFixed(1)}) - model:${qValue.toFixed(2)}, score:${score.toFixed(2)}, weight:${modelWeight.toFixed(2)}, combined:${combinedScore.toFixed(2)}`);
              
              if (combinedScore > bestQValue) {
                bestQValue = combinedScore;
                bestAction = action;
              }
            } catch (innerError) {
              console.warn('Error evaluating action:', innerError);
              // Continue to next action
            }
          }
          
          // If no action was selected by the model, fall back to a more intelligent selection
          if (!bestAction && scoredActions.length > 0) {
            // Don't just take the first action, select most stable one
            const stableActions = scoredActions
              .filter(a => calculateStabilityScore(a.action.position, a.action.rotation, packedItems) > 0.7);
            
            if (stableActions.length > 0) {
              console.log(`Using stable fallback position for item ${currentItem.name}`);
              bestAction = stableActions[0].action;
            } else if (scoredActions.length > 0) {
              console.warn(`No stable positions found for item ${currentItem.name}, using best available`);
              bestAction = scoredActions[0].action;
            }
          }
          console.log('[RL PACKER] Successfully used JavaScript model for prediction ✅');
        } else {
          // Try using the Flask server as fallback
          console.log('[RL PACKER] Local model not available, trying Flask server as fallback...');
          try {
            const response = await fetch(`${MODEL_SERVER_URL}/predict`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                const_in: [Array(32).fill(0).map(() => Array(32).fill(1))],
                hmap_in: [createHeightMap(container, packedItems)],
                amap_in: [createActionMap(container, validActions[0].position, validActions[0].rotation, 
                          createHeightMap(container, packedItems))],
                imap_in: [createItemMap(remainingItems, container)]
              })
            });
            
            if (!response.ok) {
              throw new Error(`Server responded with status: ${response.status}`);
            }
            console.log('[RL PACKER] Successfully connected to Flask server ✅');
            
            const data = await response.json();
            if (data.status === 'success') {
              // Use the prediction to select the best action
              // For simplicity, we'll just use the first valid action for now
              bestAction = validActions[0];
              console.log('[RL PACKER] Successfully received prediction from Flask server ✅');
            } else {
              throw new Error('Model prediction failed');
            }
          } catch (serverError) {
            console.error('[RL PACKER] Error using Flask server:', serverError);
            console.warn('[RL PACKER] Both local model and Flask server failed, falling back to heuristic approach ⚠️');
            throw new Error('Model not loaded and server unavailable');
          }
        }
      } catch (error) {
        console.error('[RL PACKER] Error using models, falling back to heuristic approach:', error);
        console.log('[RL PACKER] USING HEURISTIC FALLBACK - No neural network being used ⚠️');
        // Fall back to heuristic approach
        for (const action of validActions) {
          const { position, rotation } = action;
          
          // Calculate stability score (percentage of bottom face supported)
          const stabilityScore = calculateStabilityScore(position, rotation, packedItems);
          
          // Calculate space utilization score
          const spaceUtilizationScore = calculateSpaceUtilizationScore(position, rotation, packedItems, container);
          
          // Calculate compactness score
          const compactnessScore = calculateCompactnessScore(position, rotation, packedItems, container);
          
          // Combined score (weighted sum)
          const qValue = (0.5 * stabilityScore) + (0.3 * spaceUtilizationScore) + (0.2 * compactnessScore);
          
          if (qValue > bestQValue) {
            bestQValue = qValue;
            bestAction = action;
          }
        }
      }
      
      // Apply the best action
      if (bestAction) {
        if (DEBUG_PACKING) console.log(`[RL PACKER] Attempting to pack item ${currentItem.name} using selected action`);
        
        const { position, rotation } = bestAction;
        
        if (DEBUG_PACKING) console.log(`[RL PACKER] Position: (${position.x.toFixed(1)}, ${position.y.toFixed(1)}, ${position.z.toFixed(1)}), Rotation: (L:${rotation.length.toFixed(1)}, W:${rotation.width.toFixed(1)}, H:${rotation.height.toFixed(1)})`);
        
        // Double-check for boundary violations
        if (position.x < 0 || position.y < 0 || position.z < 0 ||
            position.x + rotation.length > container.length ||
            position.y + rotation.height > container.height ||
            position.z + rotation.width > container.width) {
          console.error('[RL PACKER] Boundary violation detected before applying action:', position, rotation, container);
          remainingItems.shift(); // Skip this item
          continue;
        }
        
        if (DEBUG_PACKING) console.log(`[RL PACKER] Boundary check passed`);
        
        // Check for stability with stricter requirements
        const stabilityScore = calculateStabilityScore(position, rotation, packedItems);
        // Only log the stability score for very low support cases
        if (stabilityScore < 0.5) {
          console.warn('Item has low stability score:', stabilityScore.toFixed(2));
        }  
          // For very low support, try to find a better position if possible
          if (stabilityScore < 0.1 && validActions.length > 1) {
            console.log('[RL PACKER] STABILITY FALLBACK: Very low support detected (score: ' + stabilityScore.toFixed(2) + '), trying to find a better position... ⚠️');
            let betterAction = null;
            let bestSupport = stabilityScore;
            
            // Check a few more positions to find better support
            for (let i = 1; i < Math.min(5, validActions.length); i++) {
              const altAction = validActions[i];
              const altScore = calculateStabilityScore(
                altAction.position, 
                altAction.rotation, 
                packedItems
              );
              
              if (altScore > bestSupport) {
                bestSupport = altScore;
                betterAction = altAction;
                
                // If we find a significantly better position, use it
                if (bestSupport > 0.3) break;
              }
            }
            
            // If we found a better position, use it
            if (betterAction && bestSupport > stabilityScore) {
              console.log(`[RL PACKER] STABILITY FALLBACK: Found better position with support: ${bestSupport.toFixed(2)} ✅`);
              bestAction = betterAction;
            } else {
              console.log(`[RL PACKER] STABILITY FALLBACK: No better position found, using original with low stability ⚠️`);
            }
          }
        
        // Double-check for collisions
        let hasCollision = false;
        for (const packedItem of packedItems) {
          const overlapX = Math.max(0, 
            Math.min(position.x + rotation.length, packedItem.position.x + packedItem.rotation.length) - 
            Math.max(position.x, packedItem.position.x));
            
          const overlapY = Math.max(0, 
            Math.min(position.y + rotation.height, packedItem.position.y + packedItem.rotation.height) - 
            Math.max(position.y, packedItem.position.y));
            
          const overlapZ = Math.max(0, 
            Math.min(position.z + rotation.width, packedItem.position.z + packedItem.rotation.width) - 
            Math.max(position.z, packedItem.position.z));
            
          if (overlapX > 0.01 && overlapY > 0.01 && overlapZ > 0.01) {
            console.error('Collision detected before applying action:', position, rotation, packedItem);
            hasCollision = true;
            break;
          }
        }
        
        if (hasCollision) {
          remainingItems.shift(); // Skip this item
          continue;
        }
        
        // Create packed item
        const packedItem: PackedItem = {
          ...currentItem,
          position: position,
          rotation: rotation,
          color: currentItem.color || getRandomColor()
        };
        
        // Update state
        packedItems.push(packedItem);
        remainingItems.shift();
        totalVolume += rotation.length * rotation.width * rotation.height;
        totalWeight += currentItem.weight;
      } else {
        // No good action found, skip this item
        remainingItems.shift();
      }
    } catch (error) {
      console.error('Error in reinforcement learning algorithm:', error);
      // Fallback to simple heuristic if model fails
      const validActions = generateValidActions(currentItem, packedItems, container);
      const bestAction = validActions.length > 0 ? validActions[0] : null; // Just take first valid action
      
      if (bestAction) {
        const { position, rotation } = bestAction;
        
        // Refine the position to ensure the item sits properly (gravity effect)
        const refinedPosition = refinePosition(position, rotation, packedItems);
        
        // Create packed item with the refined position
        const packedItem: PackedItem = {
          ...currentItem,
          position: refinedPosition,
          rotation,
          color: currentItem.color || getRandomColor()
        };
        
        // Verify stability after refinement
        const finalStability = calculateStabilityScore(refinedPosition, rotation, packedItems);
        if (finalStability < 0.5) {
          console.warn(`Warning: Item ${currentItem.name} placed with low stability: ${finalStability.toFixed(2)}`);
        }
        
        // Update state
        packedItems.push(packedItem);
        remainingItems.shift();
        totalVolume += rotation.length * rotation.width * rotation.height;
        totalWeight += currentItem.weight;
      } else {
        // No good action found, skip this item
        remainingItems.shift();
      }
    }
  }
  
  // Calculate statistics
  const containerVolume = container.length * container.width * container.height;
  const containerFillPercentage = (totalVolume / containerVolume) * 100;
  
  // Calculate weight capacity utilization
  const weightCapacityPercentage = container.maxWeight ? (totalWeight / container.maxWeight) * 100 : 0;
  
  // Debug the final packing state
  console.log(`[RL PACKER] Packing complete. Packed ${packedItems.length} items, ${remainingItems.length} items remaining`);
  console.log(`[RL PACKER] Container fill: ${containerFillPercentage.toFixed(2)}%, Weight: ${totalWeight.toFixed(2)}/${container.maxWeight || 'unlimited'}`);
  
  if (packedItems.length === 0) {
    console.error('[RL PACKER] WARNING: No items were packed! This is likely a bug.');
  }
  
  // Return the result
  return {
    packedItems: packedItems,  // Explicitly name the property to avoid any reference issues
    unpackedItems: remainingItems,
    containerFillPercentage,
    weightCapacityPercentage,
    totalWeight
  };
};

// Export the packer function
export { reinforcementLearningPacker };
export default reinforcementLearningPacker;
