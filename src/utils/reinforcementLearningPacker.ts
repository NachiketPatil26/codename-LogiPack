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

// Flask server URL for model predictions
const MODEL_SERVER_URL = 'http://localhost:5001';

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
  
  // Check if the item is within the container boundaries with safety margin
  if (
    position.x < -SAFETY_MARGIN || 
    position.x + rotation.length > container.length + SAFETY_MARGIN ||
    position.y < -SAFETY_MARGIN || 
    position.y + rotation.height > container.height + SAFETY_MARGIN ||
    position.z < -SAFETY_MARGIN || 
    position.z + rotation.width > container.width + SAFETY_MARGIN
  ) {
    return false;
  }
  
  // Check for collisions with other items
  for (const packedItem of packedItems) {
    // Get the actual dimensions of the packed item based on its rotation
    const packedItemLength = packedItem.rotation.length;
    const packedItemWidth = packedItem.rotation.width;
    const packedItemHeight = packedItem.rotation.height;
    
    // Calculate overlap with safety margin
    const overlapX = Math.max(0, 
      Math.min(position.x + rotation.length, packedItem.position.x + packedItemLength + SAFETY_MARGIN) - 
      Math.max(position.x, packedItem.position.x - SAFETY_MARGIN));
      
    const overlapY = Math.max(0, 
      Math.min(position.y + rotation.height, packedItem.position.y + packedItemHeight + SAFETY_MARGIN) - 
      Math.max(position.y, packedItem.position.y - SAFETY_MARGIN));
      
    const overlapZ = Math.max(0, 
      Math.min(position.z + rotation.width, packedItem.position.z + packedItemWidth + SAFETY_MARGIN) - 
      Math.max(position.z, packedItem.position.z - SAFETY_MARGIN));
      
    // If there's overlap in all three dimensions, there's a collision
    if (overlapX > SAFETY_MARGIN && overlapY > SAFETY_MARGIN && overlapZ > SAFETY_MARGIN) {
      return false;
    }
  }
  
  return true;
};

// Helper function to generate valid actions with boundary checking
const generateValidActions = (item: CargoItem, packedItems: PackedItem[], container: Container): { position: Position; rotation: Rotation }[] => {
  // Limit the number of actions to prevent excessive computation
  const MAX_ACTIONS = 200;
  const validActions = [];
  
  // Get possible rotations
  const rotations = getPossibleRotations(item);
  
  // Use a grid approach to reduce the number of positions to check
  const gridStep = Math.max(1, Math.min(container.length, container.width) / 20);
  
  for (const rotation of rotations) {
    // Try different positions with grid stepping
    for (let x = 0; x <= container.length - rotation.length; x += gridStep) {
      for (let z = 0; z <= container.width - rotation.width; z += gridStep) {
        // Find the highest point at this (x,z) coordinate
        let y = 0;
        
        for (const packedItem of packedItems) {
          // Check if this position overlaps with the packed item on the XZ plane
          const overlapX = Math.max(0, 
            Math.min(x + rotation.length, packedItem.position.x + packedItem.rotation.length) - 
            Math.max(x, packedItem.position.x));
            
          const overlapZ = Math.max(0, 
            Math.min(z + rotation.width, packedItem.position.z + packedItem.rotation.width) - 
            Math.max(z, packedItem.position.z));
            
          if (overlapX > 0 && overlapZ > 0) {
            // There is overlap, update y to be on top of this item
            const itemHeight = packedItem.rotation.height;
            y = Math.max(y, packedItem.position.y + itemHeight);
          }
        }
        
        // Check if this position is valid
        const position = { x, y, z };
        if (isPositionEmpty(position, rotation, packedItems, container)) {
          // Include all valid positions, even with partial support
          validActions.push({ position, rotation });
          
          // Limit the number of actions to prevent excessive computation
          if (validActions.length >= MAX_ACTIONS) {
            return validActions;
          }
        }
      }
    }
  }
  
  return validActions;
};

// Helper function to calculate stability score (0-1)
const calculateStabilityScore = (position: Position, rotation: Rotation, packedItems: PackedItem[], container: Container): number => {
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
  
  // Calculate how much of the bottom face is supported by other items
  let supportedArea = 0;
  const SUPPORT_THRESHOLD = 0.001; // Small threshold to account for floating point errors
  
  for (const packedItem of packedItems) {
    // Only consider items that are directly below this one (with a small tolerance)
    if (Math.abs(packedItem.position.y + packedItem.rotation.height - position.y) > SUPPORT_THRESHOLD) {
      continue;
    }
    
    // Calculate overlap in the XZ plane
    const overlapX = Math.max(0, 
      Math.min(position.x + rotation.length, packedItem.position.x + packedItem.rotation.length) - 
      Math.max(position.x, packedItem.position.x));
      
    const overlapZ = Math.max(0, 
      Math.min(position.z + rotation.width, packedItem.position.z + packedItem.rotation.width) - 
      Math.max(position.z, packedItem.position.z));
      
    // Add the overlapping area to the supported area
    supportedArea += overlapX * overlapZ;
  }
  
  // Calculate the percentage of the bottom face that is supported
  const supportPercentage = supportedArea / bottomFaceArea;
  
  // Log support percentage for debugging
  if (supportPercentage < 0.7) {
    console.log('Item has partial support in RL packer:', supportPercentage);
  }
  
  // Return a scaled score based on support percentage
  // Even items with low support get a non-zero score to allow placement
  return Math.max(0.1, supportPercentage);
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

// Helper functions for model input preparation
// Helper functions for model input preparation with boundary checking
function createHeightMap(container: Container, packedItems: PackedItem[]): number[][] {
  // Create a 32x32 grid representing the height at each position
  const gridSize = 32;
  const heightMap = Array(gridSize).fill(0).map(() => Array(gridSize).fill(0));
  
  // Fill height map based on packed items
  packedItems.forEach(item => {
    const x = Math.floor((item.position.x / container.length) * gridSize);
    const z = Math.floor((item.position.z / container.width) * gridSize);
    const width = Math.ceil((item.rotation.length / container.length) * gridSize);
    const depth = Math.ceil((item.rotation.width / container.width) * gridSize);
    const height = item.position.y + item.rotation.height;
    
    for (let i = x; i < x + width && i < gridSize; i++) {
      for (let j = z; j < z + depth && j < gridSize; j++) {
        if (i >= 0 && j >= 0 && i < gridSize && j < gridSize) {
          heightMap[j][i] = Math.max(heightMap[j][i], height / container.height);
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
  const gridSize = 32;
  const actionMap = JSON.parse(JSON.stringify(heightMap)); // Deep copy
  
  const x = Math.floor((position.x / container.length) * gridSize);
  const z = Math.floor((position.z / container.width) * gridSize);
  const width = Math.ceil((rotation.length / container.length) * gridSize);
  const depth = Math.ceil((rotation.width / container.width) * gridSize);
  const height = (position.y + rotation.height) / container.height;
  
  for (let i = x; i < x + width && i < gridSize; i++) {
    for (let j = z; j < z + depth && j < gridSize; j++) {
      if (i >= 0 && j >= 0 && i < gridSize && j < gridSize) {
        actionMap[j][i] = height;
      }
    }
  }
  
  return actionMap;
}

function createItemMap(remainingItems: CargoItem[], container: Container): number[][] {
  if (!remainingItems || remainingItems.length === 0) {
    // Return empty item map if no items
    return Array(4).fill(0).map(() => Array(3).fill(0));
  }
  // Take up to 4 items (k=5 means current item + 4 future items)
  const items = remainingItems.slice(0, 4);
  
  // Normalize dimensions
  const maxDim = Math.max(container.length, container.width, container.height);
  
  // Create item map with normalized dimensions
  const itemMap = items.map(item => [
    item.length / maxDim,
    item.height / maxDim,
    item.width / maxDim
  ]);
  
  // Pad with zeros if less than 4 items
  while (itemMap.length < 4) {
    itemMap.push([0, 0, 0]);
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
  try {
    console.log('Loading DeepPack3D model...');
    modelLoaded = await deepPackModel.loadModel();
    if (modelLoaded) {
      console.log('DeepPack3D model loaded successfully');
    } else {
      console.warn('Failed to load DeepPack3D model, falling back to heuristic approach');
    }
  } catch (error) {
    console.error('Error loading DeepPack3D model:', error);
    console.warn('Falling back to heuristic approach');
  }
  
  // Initialize state
  const packedItems: PackedItem[] = [];
  let remainingItems = [...items];
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
    const validActions = generateValidActions(currentItem, packedItems, container);
    
    if (validActions.length === 0) {
      // No valid positions found, skip this item
      remainingItems.shift();
      continue;
    }
    
    try {
      // Use model to select best action
      let bestAction: { position: Position; rotation: Rotation } | null = null;
      let bestQValue = -Infinity;
      
      // First try to use the Flask server
      try {
        // Try to use the JavaScript model if loaded
        if (modelLoaded) {
          // Score and sort actions
          const scoredActions = validActions.map(action => {
            const { position, rotation } = action;
            const stabilityScore = calculateStabilityScore(position, rotation, packedItems, container);
            const spaceUtilizationScore = calculateSpaceUtilizationScore(position, rotation, packedItems, container);
            const compactnessScore = calculateCompactnessScore(position, rotation, packedItems, container);
            
            // Calculate a base score
            let score = (0.5 * stabilityScore) + (0.3 * spaceUtilizationScore) + (0.2 * compactnessScore);
            
            // Bonus for ground positions
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
              
              // Prepare inputs for the model
              const constMap = Array(32).fill(0).map(() => Array(32).fill(1));
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
              
              // Combine model prediction with score for more robust decisions
              const combinedScore = (0.7 * qValue) + (0.3 * score);
              
              if (combinedScore > bestQValue) {
                bestQValue = combinedScore;
                bestAction = action;
              }
            } catch (innerError) {
              console.warn('Error evaluating action:', innerError);
              // Continue to next action
            }
          }
          
          // If no action was selected by the model, fall back to the best scored action
          if (!bestAction && scoredActions.length > 0) {
            bestAction = scoredActions[0].action;
          }
        } else {
          // Try using the Flask server as fallback
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
            
            const data = await response.json();
            if (data.status === 'success') {
              // Use the prediction to select the best action
              // For simplicity, we'll just use the first valid action for now
              bestAction = validActions[0];
            } else {
              throw new Error('Model prediction failed');
            }
          } catch (serverError) {
            console.error('Error using Flask server:', serverError);
            throw new Error('Model not loaded and server unavailable');
          }
        }
      } catch (error) {
        console.error('Error using JavaScript model, falling back to heuristic approach:', error);
        // Fall back to heuristic approach
        for (const action of validActions) {
          const { position, rotation } = action;
          
          // Calculate stability score (percentage of bottom face supported)
          const stabilityScore = calculateStabilityScore(position, rotation, packedItems, container);
          
          // Calculate space utilization score
          const spaceUtilizationScore = calculateSpaceUtilizationScore(position, rotation, packedItems, container);
          
          // Calculate compactness score (how close to other items)
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
        const { position, rotation } = bestAction;
        
        // Double-check for boundary violations
        if (position.x < 0 || position.y < 0 || position.z < 0 ||
            position.x + rotation.length > container.length ||
            position.y + rotation.height > container.height ||
            position.z + rotation.width > container.width) {
          console.error('Boundary violation detected before applying action:', position, rotation, container);
          remainingItems.shift(); // Skip this item
          continue;
        }
        
        // Check for stability but don't reject items with partial support
        const stabilityScore = calculateStabilityScore(position, rotation, packedItems, container);
        // Only log the stability score for very low support cases
        if (stabilityScore < 0.2) {
          console.warn('Item has low stability score but will be placed anyway:', stabilityScore.toFixed(2));
          
          // For very low support, try to find a better position if possible
          if (stabilityScore < 0.1 && validActions.length > 1) {
            console.log('Very low support, trying to find a better position...');
            let betterAction = null;
            let bestSupport = stabilityScore;
            
            // Check a few more positions to find better support
            for (let i = 1; i < Math.min(5, validActions.length); i++) {
              const altAction = validActions[i];
              const altScore = calculateStabilityScore(
                altAction.position, 
                altAction.rotation, 
                packedItems, 
                container
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
              console.log(`Found better position with support: ${bestSupport.toFixed(2)}`);
              bestAction = betterAction;
            }
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
          position,
          rotation,
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
        
        // Create packed item
        const packedItem: PackedItem = {
          ...currentItem,
          position,
          rotation,
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
    }
  }
  
  // Calculate container fill percentage
  const containerVolume = container.length * container.width * container.height;
  const containerFillPercentage = (totalVolume / containerVolume) * 100;
  
  // Calculate weight capacity percentage
  const weightCapacityPercentage = container.maxWeight > 0 
    ? (totalWeight / container.maxWeight) * 100
    : 0;
  
  // Return the packing result
  return {
    packedItems,
    unpackedItems: remainingItems,
    containerFillPercentage,
    weightCapacityPercentage,
    totalWeight
  };
};

// Export the packer function
export { reinforcementLearningPacker };
export default reinforcementLearningPacker;
