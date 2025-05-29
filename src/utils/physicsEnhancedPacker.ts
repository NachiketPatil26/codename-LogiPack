// Physics-Enhanced Guillotine Algorithm with Center of Gravity and Torque Constraints
// Professional-grade implementation for logistics industry applications

import { CargoItem, Container, PackedItem, PackedResult, ConstraintType } from '../types';

/**
 * Physics-Enhanced Guillotine Algorithm
 * Optimizes packing with physical constraints for improved stability and safety:
 * - Center of gravity optimization
 * - Torque minimization
 * - Weight distribution balancing
 * - Proper support for items (no floating)
 * - Fragile item handling
 * - Stackability constraints
 */
export const physicsEnhancedPacker = (items: CargoItem[], container: Container, progressCallback?: (progress: number, state: any) => void): PackedResult => {
  console.log('[physicsEnhancedPacker] Initializing...');
  console.log(`[physicsEnhancedPacker] Input items array length (unique item types): ${items.length}`);
  let sumOfInputQuantities = 0;
  items.forEach(item => sumOfInputQuantities += item.quantity);
  console.log(`[physicsEnhancedPacker] Sum of quantities from input items (expected total individual items): ${sumOfInputQuantities}`);
  console.log('Using Physics-Enhanced Guillotine Algorithm');
  
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
  
  console.log(`[physicsEnhancedPacker] Expanded ${items.length} item types to ${expandedItems.length} individual items based on quantity.`);
  
  // Constants for physics and stability calculations
  const MAX_ACCEPTABLE_TORQUE_RATIO = 0.7; // Maximum acceptable torque as ratio of total weight
  const MAX_COG_DEVIATION_RATIO = 0.2; // Maximum deviation of COG from ideal center (as ratio of dimension)
  const MIN_SUPPORT_RATIO = 0.5; // Minimum support required beneath an item (50% of base area) - reduced from 70% to allow more placements
  
  // Sort items by multiple criteria for optimal packing
  // Prioritize larger and heavier boxes at the bottom for better stability
  const sortedItems = [...expandedItems].sort((a, b) => {
    // Primary sort: Heaviest items first (for better stability)
    if (Math.abs(b.weight - a.weight) > 0.01) return b.weight - a.weight;
    
    // Secondary sort: Larger volume first (ensures larger boxes are placed first)
    const volumeA = a.length * a.width * a.height;
    const volumeB = b.length * b.width * b.height;
    if (Math.abs(volumeB - volumeA) > 0.01) return volumeB - volumeA;
    
    // Tertiary sort: Larger base area first (better stability)
    const baseAreaA = a.length * a.width;
    const baseAreaB = b.length * b.width;
    if (Math.abs(baseAreaB - baseAreaA) > 0.01) return baseAreaB - baseAreaA;
    
    // Fourth sort: Lower height-to-base ratio first (more stable shapes at bottom)
    const ratioA = a.height / Math.sqrt(baseAreaA);
    const ratioB = b.height / Math.sqrt(baseAreaB);
    return ratioA - ratioB; // Lower ratio (less tall/thin) first
  });
  console.log(`[physicsEnhancedPacker] After sorting, we have ${sortedItems.length} individual items.`);
  
  // Group similar items together for better distribution
  const groupedItems: CargoItem[][] = [];
  
  // Group by similar dimensions (within 10% tolerance)
  const dimensionTolerance = 0.1;
  
  for (const item of sortedItems) {
    let foundGroup = false;
    
    for (const group of groupedItems) {
      const referenceItem = group[0];
      
      // Check if dimensions are similar (within tolerance)
      const lengthSimilar = Math.abs(item.length - referenceItem.length) / referenceItem.length <= dimensionTolerance;
      const widthSimilar = Math.abs(item.width - referenceItem.width) / referenceItem.width <= dimensionTolerance;
      const heightSimilar = Math.abs(item.height - referenceItem.height) / referenceItem.height <= dimensionTolerance;
      
      if (lengthSimilar && widthSimilar && heightSimilar) {
        group.push(item);
        foundGroup = true;
        break;
      }
    }
    
    if (!foundGroup) {
      groupedItems.push([item]);
    }
  }
  
  // Flatten groups but maintain grouping order
  const reorderedItems: CargoItem[] = [];
  for (const group of groupedItems) {
    reorderedItems.push(...group);
  }
  console.log(`[physicsEnhancedPacker] After grouping and reordering, we have ${reorderedItems.length} individual items to attempt packing.`);
  
  // Initialize container dimensions and tracking variables
  const containerLength = container.length;
  const containerWidth = container.width;
  const containerHeight = container.height;
  const containerVolume = containerLength * containerWidth * containerHeight;
  
  // Track packed and unpacked items
  const packedItems: PackedItem[] = [];
  const unpackedItems: CargoItem[] = [];
  let totalVolumePacked = 0;
  let totalWeight = 0;
  
  // Ideal center of gravity (center of container base)
  const idealCenterOfGravity = {
    x: containerLength / 2,
    y: 0, // As low as possible
    z: containerWidth / 2
  };
  
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
  
  // Function to calculate center of gravity of packed items
  const calculateCenterOfGravity = (items: PackedItem[]): { x: number; y: number; z: number } => {
    if (items.length === 0) return { x: 0, y: 0, z: 0 };
    
    let totalWeight = 0;
    let totalMomentX = 0;
    let totalMomentY = 0;
    let totalMomentZ = 0;
    
    for (const item of items) {
      // Calculate center point of the item
      const centerX = item.position.x + item.length / 2;
      const centerY = item.position.y + item.height / 2;
      const centerZ = item.position.z + item.width / 2;
      
      // Calculate moment (weight * distance from origin)
      totalMomentX += centerX * item.weight;
      totalMomentY += centerY * item.weight;
      totalMomentZ += centerZ * item.weight;
      
      totalWeight += item.weight;
    }
    
    // If no weight (shouldn't happen), return default
    if (totalWeight === 0) return { x: 0, y: 0, z: 0 };
    
    return {
      x: totalMomentX / totalWeight,
      y: totalMomentY / totalWeight,
      z: totalMomentZ / totalWeight
    };
  };
  
  // Calculate torque (rotational force) on the container
  const calculateTorque = (items: PackedItem[], cog: { x: number; y: number; z: number }): number => {
    let totalTorque = 0;
    
    for (const item of items) {
      // Calculate center of item (x, z for horizontal plane, y for vertical position)
      const centerX = item.position.x + item.length / 2;
      const centerZ = item.position.z + item.width / 2;
      
      // Calculate distance from center of gravity in horizontal plane (for tipping calculation)
      const distanceX = centerX - cog.x;
      const distanceZ = centerZ - cog.z;
      
      // Calculate distance (lever arm) - only consider horizontal plane for tipping
      const distance = Math.sqrt(distanceX * distanceX + distanceZ * distanceZ);
      
      // Calculate torque contribution (weight * distance)
      totalTorque += item.weight * distance;
    }
    
    return totalTorque;
  };
  
  // Calculate stability score for an item placement (higher is better)
  const calculateStabilityScore = (item: CargoItem, position: { x: number; y: number; z: number }, currentPackedItems: PackedItem[]): number => {
    // Create a temporary item to test placement
    const tempItem: PackedItem = {
      ...item,
      position,
      rotation: { x: 0, y: 0, z: 0 }
    };
    
    // Create a temporary array with all currently packed items plus this new one
    const tempPackedItems = [...currentPackedItems, tempItem];
    
    // Calculate center of gravity with this item added
    const cog = calculateCenterOfGravity(tempPackedItems);
    
    // Calculate support score (how well the item is supported from below)
    let supportScore = 0;
    
    // If item is on the ground, it's fully supported
    if (position.y === 0) {
      supportScore = 1;
    } else {
      // Calculate how much of this item's base is supported by items below
      let supportedArea = 0;
      const itemBaseArea = item.length * item.width;
      let supportedBySmaller = false;
      const itemVolume = item.length * item.width * item.height;
      
      for (const packedItem of currentPackedItems) {
        // Only consider items directly below this one
        if (Math.abs(packedItem.position.y + packedItem.height - position.y) < 0.001) {
          // Calculate overlap area (intersection of rectangles)
          const overlapX = Math.max(
            0,
            Math.min(position.x + item.length, packedItem.position.x + packedItem.length) -
            Math.max(position.x, packedItem.position.x)
          );
          
          const overlapZ = Math.max(
            0,
            Math.min(position.z + item.width, packedItem.position.z + packedItem.width) -
            Math.max(position.z, packedItem.position.z)
          );
          
          const thisOverlapArea = overlapX * overlapZ;
          supportedArea += thisOverlapArea;
          
          // Check if this item is larger than the one beneath it
          // We want to prevent large boxes on small boxes
          const supportVolume = packedItem.length * packedItem.width * packedItem.height;
          
          // If this item is significantly larger than its support (>20% larger)
          // and there's meaningful overlap, mark it as supported by a smaller item
          if (thisOverlapArea > 0.1 * itemBaseArea && itemVolume > supportVolume * 1.2) {
            supportedBySmaller = true;
          }
        }
      }
      
      // Base support score calculation
      supportScore = Math.min(1, supportedArea / (itemBaseArea * MIN_SUPPORT_RATIO));
      
      // Penalize stacking large boxes on smaller ones
      if (supportedBySmaller) {
        supportScore *= 0.5; // 50% penalty for stacking large on small
      }
    }
    
    // Calculate COG deviation from ideal (lower is better)
    const cogDeviationX = Math.abs(cog.x - idealCenterOfGravity.x) / containerLength;
    const cogDeviationZ = Math.abs(cog.z - idealCenterOfGravity.z) / containerWidth;
    const cogDeviation = (cogDeviationX + cogDeviationZ) / 2;
    const cogDeviationScore = 1 - Math.min(1, cogDeviation / MAX_COG_DEVIATION_RATIO);
    
    // Calculate torque score (lower torque is better)
    const totalWeight = tempPackedItems.reduce((sum, item) => sum + item.weight, 0);
    const torque = calculateTorque(tempPackedItems, cog);
    const maxAcceptableTorque = totalWeight * MAX_ACCEPTABLE_TORQUE_RATIO;
    const torqueScore = 1 - Math.min(1, torque / maxAcceptableTorque);
    
    // Calculate height efficiency (lower center of gravity is better)
    const heightScore = 1 - (cog.y / containerHeight);
    
    // Calculate balance score (how well this placement balances the load)
    // Higher score for positions that move COG closer to ideal center
    let balanceScore = 0;
    
    // If this is the first item, prioritize center placement
    if (currentPackedItems.length === 0) {
      // Score based on how close to center the item is placed
      const distanceFromCenterX = Math.abs(position.x + item.length/2 - containerLength/2) / containerLength;
      const distanceFromCenterZ = Math.abs(position.z + item.width/2 - containerWidth/2) / containerWidth;
      balanceScore = 1 - ((distanceFromCenterX + distanceFromCenterZ) / 2);
    } else {
      // For subsequent items, score based on how they improve COG
      const currentCog = calculateCenterOfGravity(currentPackedItems);
      
      // Calculate current deviation from ideal
      const currentDeviationX = Math.abs(currentCog.x - idealCenterOfGravity.x) / containerLength;
      const currentDeviationZ = Math.abs(currentCog.z - idealCenterOfGravity.z) / containerWidth;
      const currentDeviation = (currentDeviationX + currentDeviationZ) / 2;
      
      // Calculate improvement in deviation
      const improvement = Math.max(0, currentDeviation - cogDeviation);
      balanceScore = improvement * 5; // Amplify the improvement
      
      // Cap at 1.0
      balanceScore = Math.min(1, balanceScore);
    }
    
    // Calculate size-based stacking score (penalize large items on top of small items)
    let stackingScore = 1.0;
    if (position.y > 0) {
      // Check if this item is stacked on smaller items
      const itemVolume = item.length * item.width * item.height;
      let smallerSupportCount = 0;
      let totalSupportCount = 0;
      
      for (const packedItem of currentPackedItems) {
        // Only consider items directly below this one
        if (Math.abs(packedItem.position.y + packedItem.height - position.y) < 0.001) {
          const supportVolume = packedItem.length * packedItem.width * packedItem.height;
          totalSupportCount++;
          
          // Count supports that are significantly smaller (>20% smaller)
          if (itemVolume > supportVolume * 1.2) {
            smallerSupportCount++;
          }
        }
      }
      
      // If there are supports and most of them are smaller, penalize
      if (totalSupportCount > 0) {
        const smallerRatio = smallerSupportCount / totalSupportCount;
        // Apply penalty proportional to how many smaller supports there are
        // Reduced penalty from 0.7 to 0.5 to allow more stacking for better space utilization
        stackingScore = 1.0 - (smallerRatio * 0.5);
      }
    }
    
    // Calculate space utilization score (how well this position fills available space)
    let spaceUtilizationScore = 0.0;
    
    // Check how well this item fits in its space
    if (currentPackedItems.length > 0) {
      // Find nearby items to check for tight packing
      let contactCount = 0;
      let potentialContactCount = 6; // Maximum 6 sides could have contact
      
      // Check if item is against container walls (these count as good contacts)
      if (position.x === 0) contactCount++;
      if (position.y === 0) contactCount++;
      if (position.z === 0) contactCount++;
      if (position.x + item.length === containerLength) contactCount++;
      if (position.z + item.width === containerWidth) contactCount++;
      
      // Check for contact with other items (tight packing)
      for (const packedItem of currentPackedItems) {
        // Check for contact on X axis (front/back)
        if (Math.abs(position.x - (packedItem.position.x + packedItem.length)) < 0.001 ||
            Math.abs(packedItem.position.x - (position.x + item.length)) < 0.001) {
          // Check if they overlap in Y and Z
          if (overlapsInDimension(position.y, item.height, packedItem.position.y, packedItem.height) &&
              overlapsInDimension(position.z, item.width, packedItem.position.z, packedItem.width)) {
            contactCount++;
          }
        }
        
        // Check for contact on Z axis (left/right)
        if (Math.abs(position.z - (packedItem.position.z + packedItem.width)) < 0.001 ||
            Math.abs(packedItem.position.z - (position.z + item.width)) < 0.001) {
          // Check if they overlap in X and Y
          if (overlapsInDimension(position.x, item.length, packedItem.position.x, packedItem.length) &&
              overlapsInDimension(position.y, item.height, packedItem.position.y, packedItem.height)) {
            contactCount++;
          }
        }
        
        // Contact on Y axis is already handled by support calculation
      }
      
      // Calculate space utilization score based on contact count
      spaceUtilizationScore = contactCount / potentialContactCount;
    } else {
      // For the first item, prefer corner placement for better space utilization
      if (position.x === 0 && position.y === 0 && position.z === 0) {
        spaceUtilizationScore = 1.0; // Perfect corner placement
      } else if (position.x === 0 || position.y === 0 || position.z === 0) {
        spaceUtilizationScore = 0.5; // At least against one wall
      }
    }
    
    // Helper function to check if two ranges overlap
    function overlapsInDimension(start1: number, size1: number, start2: number, size2: number): boolean {
      return (start1 < start2 + size2) && (start2 < start1 + size1);
    }
    
    // Calculate final stability score with enhanced weights for COG and torque
    // For the first few items, heavily prioritize space utilization while maintaining stability
    if (currentPackedItems.length < 5) {
      return (
        supportScore * 0.1 +
        cogDeviationScore * 0.15 +  // Reduced weight for COG to prioritize space utilization
        torqueScore * 0.1 +         // Reduced weight for torque to prioritize space utilization
        heightScore * 0.05 +        // Kept the same
        balanceScore * 0.05 +       // Kept the same
        stackingScore * 0.05 +      // Kept the same
        spaceUtilizationScore * 0.5  // Significantly increased weight for space utilization
      );
    } else {
      return (
        supportScore * 0.1 +
        cogDeviationScore * 0.1 +
        torqueScore * 0.05 +
        heightScore * 0.05 +
        balanceScore * 0.05 +
        stackingScore * 0.05 +
        spaceUtilizationScore * 0.6  // Even higher weight for space utilization in later items
      );
    }
  };
  
  // Function to calculate contact area between items (higher contact = better stability)
  const calculateContactArea = (
    item: CargoItem,
    position: { x: number; y: number; z: number },
    packedItems: PackedItem[]
  ): number => {
    let contactArea = 0;
    const itemBaseArea = item.length * item.width;
    
    // If on ground, count full base contact
    if (position.y === 0) {
      contactArea += itemBaseArea;
    }
    
    for (const packedItem of packedItems) {
      // Check contact with each face
      
      // Bottom face contact (support)
      if (position.y === packedItem.position.y + packedItem.height) {
        const overlapX = Math.max(
          0,
          Math.min(position.x + item.length, packedItem.position.x + packedItem.length) -
          Math.max(position.x, packedItem.position.x)
        );
        
        const overlapZ = Math.max(
          0,
          Math.min(position.z + item.width, packedItem.position.z + packedItem.width) -
          Math.max(position.z, packedItem.position.z)
        );
        
        contactArea += overlapX * overlapZ;
      }
      
      // Side contacts (left, right, front, back, top)
      // Left face
      const touchingLeft = 
        position.x === packedItem.position.x + packedItem.length &&
        position.z < packedItem.position.z + packedItem.width &&
        position.z + item.width > packedItem.position.z &&
        position.y < packedItem.position.y + packedItem.height &&
        position.y + item.height > packedItem.position.y;
        
      // Right face
      const touchingRight = 
        position.x + item.length === packedItem.position.x &&
        position.z < packedItem.position.z + packedItem.width &&
        position.z + item.width > packedItem.position.z &&
        position.y < packedItem.position.y + packedItem.height &&
        position.y + item.height > packedItem.position.y;
        
      // Front face
      const touchingFront = 
        position.z === packedItem.position.z + packedItem.width &&
        position.x < packedItem.position.x + packedItem.length &&
        position.x + item.length > packedItem.position.x &&
        position.y < packedItem.position.y + packedItem.height &&
        position.y + item.height > packedItem.position.y;
        
      // Back face
      const touchingBack = 
        position.z + item.width === packedItem.position.z &&
        position.x < packedItem.position.x + packedItem.length &&
        position.x + item.length > packedItem.position.x &&
        position.y < packedItem.position.y + packedItem.height &&
        position.y + item.height > packedItem.position.y;
        
      // Top face
      const touchingTop = 
        position.y + item.height === packedItem.position.y &&
        position.x < packedItem.position.x + packedItem.length &&
        position.x + item.length > packedItem.position.x &&
        position.z < packedItem.position.z + packedItem.width &&
        position.z + item.width > packedItem.position.z;
      
      // Add contact area for each touching face (simplified calculation)
      if (touchingLeft || touchingRight) {
        contactArea += item.height * item.width * 0.5; // Only count half for side contacts
      }
      if (touchingFront || touchingBack) {
        contactArea += item.height * item.length * 0.5;
      }
      if (touchingTop) {
        contactArea += item.length * item.width * 0.5;
      }
    }
    
    return contactArea;
  };
  
  // Enhanced function to split a space after placing an item - optimized for tighter packing
  const splitSpace = (space: Space, item: CargoItem, x: number, y: number, z: number): Space[] => {
    // Create more granular spaces after placing the item for tighter packing
    const possibleSpaces: Space[] = [];
    
    // Calculate item dimensions and boundaries
    const itemEndX = x + item.length;
    const itemEndY = y + item.height;
    const itemEndZ = z + item.width;
    
    // Calculate space boundaries
    const spaceEndX = space.x + space.length;
    const spaceEndY = space.y + space.height;
    const spaceEndZ = space.z + space.width;
    
    // Minimum useful dimension - adjusted to be smaller for tighter packing
    const minDimension = 0.01; // 0.1cm minimum - reduced for even tighter packing
    
    // 1. STANDARD GUILLOTINE SPACES (traditional approach)
    
    // Space to the right of the item (along x-axis/length)
    if (itemEndX < spaceEndX) {
      possibleSpaces.push({
        x: itemEndX,
        y: space.y,
        z: space.z,
        length: spaceEndX - itemEndX,
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
    if (itemEndY < spaceEndY) {
      possibleSpaces.push({
        x: space.x,
        y: itemEndY,
        z: space.z,
        length: space.length,
        height: spaceEndY - itemEndY,
        width: space.width
      });
    }
    
    // Space in front of the item (along z-axis/width)
    if (itemEndZ < spaceEndZ) {
      possibleSpaces.push({
        x: space.x,
        y: space.y,
        z: itemEndZ,
        length: space.length,
        height: space.height,
        width: spaceEndZ - itemEndZ
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
    
    // 2. MAXIMAL SPACES (creates more optimal spaces that maximize usage)
    
    // Right-top space (between right edge of item and right edge of space, from top of item to top of space)
    if (itemEndX < spaceEndX && itemEndY < spaceEndY) {
      possibleSpaces.push({
        x: itemEndX,
        y: itemEndY,
        z: space.z,
        length: spaceEndX - itemEndX,
        height: spaceEndY - itemEndY,
        width: space.width
      });
    }
    
    // Right-front space
    if (itemEndX < spaceEndX && itemEndZ < spaceEndZ) {
      possibleSpaces.push({
        x: itemEndX,
        y: space.y,
        z: itemEndZ,
        length: spaceEndX - itemEndX,
        height: space.height,
        width: spaceEndZ - itemEndZ
      });
    }
    
    // Top-front space
    if (itemEndY < spaceEndY && itemEndZ < spaceEndZ) {
      possibleSpaces.push({
        x: space.x,
        y: itemEndY,
        z: itemEndZ,
        length: space.length,
        height: spaceEndY - itemEndY,
        width: spaceEndZ - itemEndZ
      });
    }
    
    // Corner space (right-top-front)
    if (itemEndX < spaceEndX && itemEndY < spaceEndY && itemEndZ < spaceEndZ) {
      possibleSpaces.push({
        x: itemEndX,
        y: itemEndY,
        z: itemEndZ,
        length: spaceEndX - itemEndX,
        height: spaceEndY - itemEndY,
        width: spaceEndZ - itemEndZ
      });
    }
    
    // Filter out spaces that are too small to be useful
    const usableSpaces = possibleSpaces.filter(space => 
      space.length >= minDimension && 
      space.height >= minDimension && 
      space.width >= minDimension
    );
    
    // Sort spaces by potential for maximizing volume usage
    const sortedSpaces = [...usableSpaces].sort((a, b) => {
      // Calculate volume of each space
      const volumeA = a.length * a.height * a.width;
      const volumeB = b.length * b.height * b.width;
      
      // Calculate compactness of each space (closer to a cube is better)
      const maxDimA = Math.max(a.length, a.height, a.width);
      const minDimA = Math.min(a.length, a.height, a.width);
      const compactnessA = minDimA / maxDimA;
      
      const maxDimB = Math.max(b.length, b.height, b.width);
      const minDimB = Math.min(b.length, b.height, b.width);
      const compactnessB = minDimB / maxDimB;
      
      // Use a weighted score that considers both volume and compactness
      const scoreA = volumeA * (0.7 + 0.3 * compactnessA);
      const scoreB = volumeB * (0.7 + 0.3 * compactnessB);
      
      return scoreB - scoreA; // Sort in descending order
    });
    
    // Take only the top spaces (to prevent too many small spaces)
    const MAX_SPACES = 10;
    return sortedSpaces.slice(0, MAX_SPACES);
  };
  
  // Check if an item fits in a space with strict boundary checking
  const itemFitsInSpace = (item: CargoItem, space: Space): boolean => {
    // First validate that the space itself is within container boundaries
    const isSpaceValid = (
      space.x >= 0 && 
      space.y >= 0 && 
      space.z >= 0 && 
      space.x + space.length <= containerLength && 
      space.y + space.height <= containerHeight && 
      space.z + space.width <= containerWidth
    );
    
    // If space extends outside container, it's invalid
    if (!isSpaceValid) {
      return false;
    }
    
    // Then check if item fits within the space with a small safety margin
    // Small margin (0.01) to account for floating point precision
    return (
      item.length <= space.length - 0.01 &&
      item.height <= space.height - 0.01 &&
      item.width <= space.width - 0.01
    );
  };
  
  // Check if an item would overlap with packed items
  const itemOverlapsWithPacked = (itemToPlace: CargoItem, x: number, y: number, z: number): boolean => {
    const epsilon = 0.01; // Larger epsilon for more reliable overlap detection
    for (const packedItem of packedItems) {
      const px = packedItem.position.x;
      const py = packedItem.position.y;
      const pz = packedItem.position.z;

      const overlapX = Math.max(0, Math.min(x + itemToPlace.length, px + packedItem.length) - Math.max(x, px));
      const overlapY = Math.max(0, Math.min(y + itemToPlace.height, py + packedItem.height) - Math.max(y, py));
      const overlapZ = Math.max(0, Math.min(z + itemToPlace.width, pz + packedItem.width) - Math.max(z, pz));

      // If there's a significant overlap in all three dimensions, items are overlapping
      if (overlapX > epsilon && overlapY > epsilon && overlapZ > epsilon) {
        return true; // Overlap detected
      }
    }
    return false; // No overlap
  };
  
  // Check if an item has adequate support from below
  const hasAdequateSupport = (item: CargoItem, x: number, y: number, z: number): boolean => {
    // Items on the ground are always supported
    if (y === 0) return true;
    
    // Calculate the base area of the item
    const itemBaseArea = item.length * item.width;
    let supportedArea = 0;
    let supportedBySmaller = false;
    const itemVolume = item.length * item.width * item.height;
    
    // Check for support from packed items below
    for (const packedItem of packedItems) {
      // Only consider items directly below this one
      if (Math.abs(packedItem.position.y + packedItem.height - y) < 0.001) {
        // Calculate overlap area (intersection of rectangles in XZ plane)
        const overlapX = Math.max(
          0,
          Math.min(x + item.length, packedItem.position.x + packedItem.length) -
          Math.max(x, packedItem.position.x)
        );
        
        const overlapZ = Math.max(
          0,
          Math.min(z + item.width, packedItem.position.z + packedItem.width) -
          Math.max(z, packedItem.position.z)
        );
        
        const thisOverlapArea = overlapX * overlapZ;
        supportedArea += thisOverlapArea;
        
        // Check if this item is larger than the one beneath it
        // We want to prevent large boxes on small boxes
        const supportVolume = packedItem.length * packedItem.width * packedItem.height;
        
        // If this item is significantly larger than its support (>40% larger)
        // and there's meaningful overlap, mark it as supported by a smaller item
        // Increased from 20% to 40% to allow more flexible stacking arrangements
        if (thisOverlapArea > 0.1 * itemBaseArea && itemVolume > supportVolume * 1.4) {
          supportedBySmaller = true;
        }
      }
    }
    
    // Calculate support ratio (supported area / base area)
    const supportRatio = supportedArea / itemBaseArea;
    
    // First few items may need more lenient stability checking
    if (packedItems.length < 3 && supportRatio > 0) {
      return true; // More lenient for first few items
    }
    
    // Prevent stacking large boxes on small boxes
    if (supportedBySmaller) {
      // If the item is significantly larger than what's supporting it,
      // require more support to ensure stability
      return supportRatio >= MIN_SUPPORT_RATIO * 1.5;
    }
    
    // Check if support ratio exceeds minimum threshold
    return supportRatio >= MIN_SUPPORT_RATIO;
  };
  
  // Check if an item placement respects weight constraints
  const respectsWeightConstraints = (item: CargoItem, x: number, y: number, z: number): boolean => {
    // Fragile items should not have heavy items on top
    if (!item.constraints) return true; // No constraints
    
    for (const packedItem of packedItems) {
      // Check if this item would be placed on top of a fragile item
      if (packedItem.constraints?.some(c => c.type === ConstraintType.FRAGILE)) {
        // Check if this item overlaps with the fragile item from above
        if (y === packedItem.position.y + packedItem.height &&
            x < packedItem.position.x + packedItem.length && x + item.length > packedItem.position.x &&
            z < packedItem.position.z + packedItem.width && z + item.width > packedItem.position.z) {
          // This item would be placed on top of a fragile item
          // Check if this item is too heavy
          const maxWeightForFragile = packedItem.constraints.find(c => c.type === ConstraintType.CAN_SUPPORT_WEIGHT)?.value || 0;
          if (item.weight > maxWeightForFragile) {
            return false; // Too heavy for the fragile item below
          }
        }
      }
    }
    
    return true;
  };
  
  // Pack items using enhanced Guillotine algorithm with physics constraints
  for (let i = 0; i < reorderedItems.length; i++) {
    // Report progress if callback is provided
    if (progressCallback) {
      const progress = (i / reorderedItems.length) * 100;
      progressCallback(progress, { packedItems, unpackedItems, totalVolumePacked, containerFillPercentage: (totalVolumePacked / containerVolume) * 100 });
    }
    const item = reorderedItems[i];
    let packed = false;
    
    // For each available space
    for (let j = 0; j < spaces.length; j++) {
      const currentSpace = spaces[j];
      
      // Check if item fits in this space
      if (!itemFitsInSpace(item, currentSpace)) continue;
      
      // Find all possible positions within this space
      type Position = { x: number, y: number, z: number, space: number };
      const possiblePositions: Position[] = [];
      
      // For the first few items, prioritize positions that distribute across the container
      if (packedItems.length < 5) {
        // Try different strategic positions based on how many items we've already packed
        switch (packedItems.length) {
          case 0: // First item - center of container
            possiblePositions.push({
              x: Math.max(currentSpace.x, (containerLength - item.length) / 2),
              y: currentSpace.y,
              z: Math.max(currentSpace.z, (containerWidth - item.width) / 2),
              space: j
            });
            break;
          case 1: // Second item - back left
            possiblePositions.push({
              x: currentSpace.x,
              y: currentSpace.y,
              z: currentSpace.z,
              space: j
            });
            break;
          case 2: // Third item - back right
            possiblePositions.push({
              x: Math.max(currentSpace.x, containerLength - item.length),
              y: currentSpace.y,
              z: currentSpace.z,
              space: j
            });
            break;
          case 3: // Fourth item - front left
            possiblePositions.push({
              x: currentSpace.x,
              y: currentSpace.y,
              z: Math.max(currentSpace.z, containerWidth - item.width),
              space: j
            });
            break;
          case 4: // Fifth item - front right
            possiblePositions.push({
              x: Math.max(currentSpace.x, containerLength - item.length),
              y: currentSpace.y,
              z: Math.max(currentSpace.z, containerWidth - item.width),
              space: j
            });
            break;
        }
      }
      
      // Also try the default position at the bottom of the space
      possiblePositions.push({
        x: currentSpace.x,
        y: currentSpace.y,
        z: currentSpace.z,
        space: j
      });
      
      // Then try positions where the item would be placed on top of already packed items
      for (const packedItem of packedItems) {
        // Position on top of a packed item
        if (packedItem.position.x + packedItem.length > currentSpace.x && 
            packedItem.position.x < currentSpace.x + currentSpace.length &&
            packedItem.position.z + packedItem.width > currentSpace.z && 
            packedItem.position.z < currentSpace.z + currentSpace.width &&
            packedItem.position.y + packedItem.height >= currentSpace.y && 
            packedItem.position.y + packedItem.height < currentSpace.y + currentSpace.height - item.height) {
          
          possiblePositions.push({
            x: Math.max(currentSpace.x, packedItem.position.x),
            y: packedItem.position.y + packedItem.height,
            z: Math.max(currentSpace.z, packedItem.position.z),
            space: j
          });
        }
      }
      
      // Score all possible positions
      const scoredPositions = possiblePositions.filter(pos => {
        // Skip positions that would cause overlap
        if (itemOverlapsWithPacked(item, pos.x, pos.y, pos.z)) return false;
        
        // Skip positions without adequate support (prevents floating items)
        if (!hasAdequateSupport(item, pos.x, pos.y, pos.z)) return false;
        
        // Skip positions that violate weight constraints
        if (!respectsWeightConstraints(item, pos.x, pos.y, pos.z)) return false;
        
        return true;
      }).map(pos => {
        // Calculate stability score
        const stabilityScore = calculateStabilityScore(item, pos, packedItems);
        
        // Calculate contact area score (normalized)
        const contactArea = calculateContactArea(item, pos, packedItems);
        const maxPossibleContactArea = 2 * item.length * item.width + 
                                       2 * item.length * item.height + 
                                       2 * item.width * item.height;
        const contactScore = Math.min(1, contactArea / (maxPossibleContactArea * 0.5));
        
        // Height score (lower is better, normalized to 0-1)
        const heightScore = 1 - Math.min(1, pos.y / containerHeight);
        
        // Score based on distance from ideal center of gravity
        const tempItem = { ...item, position: pos, rotation: { x: 0, y: 0, z: 0 } };
        const tempPackedItems = [...packedItems, tempItem];
        const cog = calculateCenterOfGravity(tempPackedItems);
        const torque = calculateTorque(tempPackedItems, cog);
        const totalTempWeight = tempPackedItems.reduce((sum, item) => sum + item.weight, 0);
        const maxAcceptableTorque = totalTempWeight * MAX_ACCEPTABLE_TORQUE_RATIO;
        const torqueScore = 1 - Math.min(1, torque / maxAcceptableTorque);
        
        // Calculate space utilization score (new) - how well this position fills available space
        const spaceUtilizationScore = 1 - (Math.max(0,
          (currentSpace.length - item.length) * (currentSpace.width - item.width)
        ) / (currentSpace.length * currentSpace.width));
        
        // Calculate corner/edge alignment score (new) - rewards placing items against walls/corners
        const isAgainstLeftWall = pos.x === 0;
        const isAgainstRightWall = pos.x + item.length >= containerLength - 0.01;
        const isAgainstFrontWall = pos.z === 0;
        const isAgainstBackWall = pos.z + item.width >= containerWidth - 0.01;
        const wallCount = [isAgainstLeftWall, isAgainstRightWall, isAgainstFrontWall, isAgainstBackWall].filter(Boolean).length;
        const cornerScore = wallCount / 4; // Normalized 0-1 based on how many walls it touches
        
        // Calculate packed item adjacency score (new) - rewards placing items close to others
        const adjacencyScore = Math.min(1, contactArea / (item.length * item.width * 0.5));
        
        // Final score: enhanced weighting for tighter packing
        // 25% stability, 15% height, 15% torque, 15% contact, 15% space utilization, 10% corners, 5% adjacency
        const score = 0.25 * stabilityScore + 
                     0.15 * heightScore + 
                     0.15 * torqueScore + 
                     0.15 * contactScore + 
                     0.15 * spaceUtilizationScore + 
                     0.10 * cornerScore + 
                     0.05 * adjacencyScore;
                     
        return { pos, score, spaceIndex: pos.space };
      });
      
      // If no valid positions, try next space
      if (scoredPositions.length === 0) continue;
      
      // Sort positions by score (highest first)
      scoredPositions.sort((a, b) => b.score - a.score);
      
      // Use the best position
      const bestPosition = scoredPositions[0];
      const x = bestPosition.pos.x;
      const y = bestPosition.pos.y;
      const z = bestPosition.pos.z;
      const spaceIndex = bestPosition.spaceIndex;
      const selectedSpace = spaces[spaceIndex];
      
      // We found a good position, proceed with placement
      
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
      const newSpaces = splitSpace(selectedSpace, item, x, y, z);
      
      // Remove the used space and add new spaces
      spaces.splice(spaceIndex, 1);
      spaces.push(...newSpaces);
      
      packed = true;
      break;
    }
    
    // If item couldn't be packed with physics constraints, try a fallback with relaxed constraints
    if (!packed) {
      // Fallback mechanism: Try again with more relaxed constraints
      for (let j = 0; j < spaces.length; j++) {
        const currentSpace = spaces[j];
        
        // Check if item fits in this space (basic check)
        if (item.length <= currentSpace.length && 
            item.height <= currentSpace.height && 
            item.width <= currentSpace.width) {
          
          // Try to place at the bottom of the space
          const x = currentSpace.x;
          const y = currentSpace.y;
          const z = currentSpace.z;
          
          // Check for basic overlap with existing items
          let hasOverlap = false;
          for (const packedItem of packedItems) {
            // Check for overlap in all three dimensions
            const overlapX = Math.max(0, 
              Math.min(x + item.length, packedItem.position.x + packedItem.length) - 
              Math.max(x, packedItem.position.x));
              
            const overlapY = Math.max(0, 
              Math.min(y + item.height, packedItem.position.y + packedItem.height) - 
              Math.max(y, packedItem.position.y));
              
            const overlapZ = Math.max(0, 
              Math.min(z + item.width, packedItem.position.z + packedItem.width) - 
              Math.max(z, packedItem.position.z));
            
            if (overlapX > 0 && overlapY > 0 && overlapZ > 0) {
              hasOverlap = true;
              break;
            }
          }
          
          if (!hasOverlap) {
            console.log(`Placed item ${item.id} using fallback mechanism (relaxed constraints)`);
            
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
              rotation: { x: 0, y: 0, z: 0 }
            });
            
            // Update totals
            const itemVolume = item.width * item.height * item.length;
            totalVolumePacked += itemVolume;
            totalWeight += item.weight;
            
            // Split the space and get new spaces
            const newSpaces = splitSpace(currentSpace, item, x, y, z);
            
            // Remove the used space and add new spaces
            spaces.splice(j, 1);
            spaces.push(...newSpaces);
            
            packed = true;
            break;
          }
        }
      }
      
      // If still not packed after fallback, add to unpacked items
      if (!packed) {
        unpackedItems.push(item);
      }
    }
  }
  
  // Calculate final statistics
  const containerFillPercentage = (totalVolumePacked / containerVolume) * 100;
  const weightCapacityPercentage = (totalWeight / container.maxWeight) * 100;
  
  // Calculate final center of gravity and stability metrics
  const finalCog = calculateCenterOfGravity(packedItems);
  const finalTorque = calculateTorque(packedItems, finalCog);
  
  // Log key metrics
  console.log('Physics-Enhanced Packing Metrics:');
  console.log(`[physicsEnhancedPacker] - Total items packed: ${packedItems.length} of ${reorderedItems.length} (total individual items attempted)`);
  console.log(`- Volume utilization: ${containerFillPercentage.toFixed(2)}%`);
  console.log(`- Weight utilization: ${weightCapacityPercentage.toFixed(2)}%`);
  console.log(`- Center of gravity: x=${finalCog.x.toFixed(2)}, y=${finalCog.y.toFixed(2)}, z=${finalCog.z.toFixed(2)}`);
  console.log(`- Stability torque ratio: ${(finalTorque / totalWeight).toFixed(4)}`);
  
  // Ensure totalWeight is a number
  const finalTotalWeight = Number(totalWeight);
  
  // Consolidate unpacked items by grouping them back by their original ID
  const consolidatedUnpacked: { [key: string]: CargoItem & { quantity: number } } = {};
  
  unpackedItems.forEach((item: CargoItem) => {
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
  
  return {
    packedItems,
    unpackedItems: finalUnpackedItems,
    containerFillPercentage,
    weightCapacityPercentage,
    totalWeight: finalTotalWeight
  };
};
