// Define interfaces for the bin packing model
interface Container {
  id: string;
  name: string;
  length: number;
  width: number;
  height: number;
  maxWeight: number;
}

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

// Interface for model prediction requests
interface PredictionRequest {
  const_in: number[][][];
  hmap_in: number[][][];
  amap_in: number[][][];
  imap_in: number[][][];
}

// Interface for model prediction responses
interface PredictionResponse {
  prediction: number[][];
  status: string;
}

// Service to interact with the Python model server
export class BinPackingModelService {
  private apiUrl: string;
  
  constructor(apiUrl = 'http://localhost:5000') {
    this.apiUrl = apiUrl;
  }

  /**
   * Check if the model server is running
   */
  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.apiUrl}/health`);
      const data = await response.json();
      return data.status === 'healthy';
    } catch (error) {
      console.error('Error checking model server health:', error);
      return false;
    }
  }

  /**
   * Convert container, items, and position data to model input features
   */
  prepareModelInputs(
    container: Container,
    packedItems: any[],
    remainingItems: CargoItem[],
    position: Position,
    rotation: Rotation
  ): PredictionRequest {
    // Create height map (32x32 grid)
    const heightMap = this.createHeightMap(container, packedItems);
    
    // Create action map (where the current item would be placed)
    const actionMap = this.createActionMap(container, position, rotation, heightMap);
    
    // Create item map (features of the next few items)
    const itemMap = this.createItemMap(remainingItems, container);
    
    // Create constant input (all ones)
    const constMap = Array(32).fill(0).map(() => Array(32).fill(1));
    
    return {
      const_in: [constMap],
      hmap_in: [heightMap],
      amap_in: [actionMap],
      imap_in: [itemMap]
    };
  }

  /**
   * Create a height map representing the current state of the container
   */
  private createHeightMap(container: Container, packedItems: any[]): number[][] {
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

  /**
   * Create an action map representing where the current item would be placed
   */
  private createActionMap(
    container: Container, 
    position: Position, 
    rotation: Rotation,
    heightMap: number[][]
  ): number[][] {
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

  /**
   * Create an item map representing the features of the next few items
   */
  private createItemMap(remainingItems: CargoItem[], container: Container): number[][] {
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

  /**
   * Get Q-value prediction from the model
   */
  async predictQValue(
    container: Container,
    packedItems: any[],
    remainingItems: CargoItem[],
    position: Position,
    rotation: Rotation
  ): Promise<number> {
    try {
      // Check if model server is healthy
      const isHealthy = await this.checkHealth();
      if (!isHealthy) {
        console.error('Model server is not available');
        return -Infinity;
      }
      
      // Prepare inputs
      const inputs = this.prepareModelInputs(
        container,
        packedItems,
        remainingItems,
        position,
        rotation
      );
      
      // Make prediction request
      const response = await fetch(`${this.apiUrl}/predict`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(inputs)
      });
      
      // Parse response
      const data: PredictionResponse = await response.json();
      
      if (data.status === 'success') {
        return data.prediction[0][0];
      } else {
        console.error('Error in model prediction:', data);
        return -Infinity;
      }
    } catch (error) {
      console.error('Error predicting Q-value:', error);
      return -Infinity;
    }
  }
}

// Create singleton instance
export const binPackingModel = new BinPackingModelService();
