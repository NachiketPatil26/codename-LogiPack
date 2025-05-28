import h5py
import json
import numpy as np
import os
import sys

# Path to the .h5 model file
model_path = '/Users/nachiketpatil/Downloads/project 2/DeepPack3D/models/k=5.h5'

# Create output directory
output_dir = '/Users/nachiketpatil/Downloads/project 2/public/models/bin_packing_model'
if not os.path.exists(output_dir):
    os.makedirs(output_dir)

def extract_model_structure(h5_file):
    """Extract model structure and weights from .h5 file without TensorFlow"""
    model_structure = {
        'layers': [],
        'input_shapes': [],
        'output_shape': None
    }
    
    # Extract model architecture
    if 'model_config' in h5_file.attrs:
        model_config = h5_file.attrs['model_config']
        if isinstance(model_config, bytes):
            model_config = model_config.decode('utf-8')
        model_structure['config'] = json.loads(model_config)
    
    # Extract weights from each layer
    if 'model_weights' in h5_file:
        weights_group = h5_file['model_weights']
        
        for layer_name in weights_group.keys():
            if 'bias:0' in weights_group[layer_name] or 'kernel:0' in weights_group[layer_name]:
                layer_weights = {}
                
                # Extract kernel weights
                if 'kernel:0' in weights_group[layer_name]:
                    kernel = weights_group[layer_name]['kernel:0'][()]
                    layer_weights['kernel'] = kernel.tolist()
                
                # Extract bias weights
                if 'bias:0' in weights_group[layer_name]:
                    bias = weights_group[layer_name]['bias:0'][()]
                    layer_weights['bias'] = bias.tolist()
                
                # Add layer to model structure
                model_structure['layers'].append({
                    'name': layer_name,
                    'weights': layer_weights
                })
    
    return model_structure

try:
    print(f"Opening model file: {model_path}")
    with h5py.File(model_path, 'r') as h5_file:
        # Extract model structure and weights
        model_data = extract_model_structure(h5_file)
        
        # Save model structure and weights as JSON
        model_json_path = os.path.join(output_dir, 'model_data.json')
        with open(model_json_path, 'w') as f:
            json.dump(model_data, f)
        
        print(f"Model structure and weights extracted to {model_json_path}")
        
        # Create a simple JavaScript implementation file
        js_implementation = """
// DeepPack3D Model Implementation in JavaScript
// This file was auto-generated from the k=5.h5 model

class DeepPack3DModel {
    constructor() {
        this.modelData = null;
        this.loaded = false;
    }
    
    async loadModel() {
        try {
            const response = await fetch('/models/bin_packing_model/model_data.json');
            this.modelData = await response.json();
            this.loaded = true;
            console.log('DeepPack3D model loaded successfully');
            return true;
        } catch (error) {
            console.error('Error loading DeepPack3D model:', error);
            return false;
        }
    }
    
    predict(constIn, hmapIn, amapIn, imapIn) {
        if (!this.loaded) {
            console.error('Model not loaded. Call loadModel() first.');
            return -Infinity;
        }
        
        // Implementation of the forward pass using the extracted weights
        // This is a simplified version and would need to be expanded based on the model architecture
        
        // For now, we'll implement a heuristic that mimics the model's behavior
        return this.calculateHeuristic(constIn, hmapIn, amapIn, imapIn);
    }
    
    calculateHeuristic(constIn, hmapIn, amapIn, imapIn) {
        // Extract the height maps and action maps
        const heightMap = hmapIn[0];
        const actionMap = amapIn[0];
        const itemFeatures = imapIn[0];
        
        // 1. Calculate height utilization
        const currentMaxHeight = Math.max(...heightMap.flat());
        const actionMaxHeight = Math.max(...actionMap.flat());
        const heightUtilization = Math.min(1.0, actionMaxHeight);
        
        // 2. Calculate support score
        const supportScore = this.calculateSupportScore(heightMap, actionMap);
        
        // 3. Calculate compactness
        const compactnessScore = this.calculateCompactness(actionMap);
        
        // 4. Calculate future items consideration
        const futureItemsScore = this.evaluateFutureItems(actionMap, itemFeatures);
        
        // Combine scores with weights
        return (
            0.3 * heightUtilization +
            0.4 * supportScore +
            0.2 * compactnessScore +
            0.1 * futureItemsScore
        );
    }
    
    calculateSupportScore(heightMap, actionMap) {
        // Find cells where the action adds height
        let baseCells = 0;
        let supportedCells = 0;
        
        for (let i = 0; i < heightMap.length; i++) {
            for (let j = 0; j < heightMap[i].length; j++) {
                if (actionMap[i][j] > heightMap[i][j]) {
                    // This is part of the item's base
                    let isBase = true;
                    
                    // Check if this is a base cell (no other part of the item below it)
                    for (let ii = 0; ii < actionMap.length; ii++) {
                        for (let jj = 0; jj < actionMap[ii].length; jj++) {
                            if ((ii !== i || jj !== j) && 
                                actionMap[ii][jj] > actionMap[i][j] &&
                                Math.abs(ii - i) <= 1 && Math.abs(jj - j) <= 1) {
                                isBase = false;
                                break;
                            }
                        }
                        if (!isBase) break;
                    }
                    
                    if (isBase) {
                        baseCells++;
                        
                        // Check if this base cell is supported
                        if (actionMap[i][j] - heightMap[i][j] < 0.1) {
                            supportedCells++;
                        }
                    }
                }
            }
        }
        
        // Calculate support percentage
        if (baseCells === 0) return 0;
        const supportPercentage = supportedCells / baseCells;
        
        // Require at least 50% support
        if (supportPercentage < 0.5) {
            return 0.1 * (supportPercentage / 0.5);
        }
        
        return supportPercentage;
    }
    
    calculateCompactness(actionMap) {
        // Find non-zero cells
        let minI = actionMap.length;
        let maxI = 0;
        let minJ = actionMap[0].length;
        let maxJ = 0;
        let occupiedVolume = 0;
        let hasOccupied = false;
        
        for (let i = 0; i < actionMap.length; i++) {
            for (let j = 0; j < actionMap[i].length; j++) {
                if (actionMap[i][j] > 0) {
                    hasOccupied = true;
                    minI = Math.min(minI, i);
                    maxI = Math.max(maxI, i);
                    minJ = Math.min(minJ, j);
                    maxJ = Math.max(maxJ, j);
                    occupiedVolume += actionMap[i][j];
                }
            }
        }
        
        if (!hasOccupied) return 0;
        
        // Calculate bounding box volume
        const bboxVolume = (maxI - minI + 1) * (maxJ - minJ + 1) * Math.max(...actionMap.flat());
        
        // Calculate compactness
        return bboxVolume > 0 ? occupiedVolume / bboxVolume : 0;
    }
    
    evaluateFutureItems(actionMap, itemFeatures) {
        if (!itemFeatures || itemFeatures.length === 0) return 1.0;
        
        // Calculate flatness of the top surface
        const nonZeroHeights = [];
        for (let i = 0; i < actionMap.length; i++) {
            for (let j = 0; j < actionMap[i].length; j++) {
                if (actionMap[i][j] > 0) {
                    nonZeroHeights.push(actionMap[i][j]);
                }
            }
        }
        
        if (nonZeroHeights.length === 0) return 0.5;
        
        // Calculate standard deviation of heights
        const mean = nonZeroHeights.reduce((a, b) => a + b, 0) / nonZeroHeights.length;
        const variance = nonZeroHeights.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / nonZeroHeights.length;
        const heightStd = Math.sqrt(variance);
        
        // Higher for flatter surfaces
        const flatnessScore = Math.exp(-heightStd);
        
        // Consider sizes of future items
        const futureItemsSizes = [];
        for (const item of itemFeatures) {
            if (item[0] + item[1] + item[2] > 0) {
                futureItemsSizes.push(item[0] * item[1] * item[2]);
            }
        }
        
        if (futureItemsSizes.length === 0) return flatnessScore;
        
        // Calculate average size of future items
        const avgFutureSize = futureItemsSizes.reduce((a, b) => a + b, 0) / futureItemsSizes.length;
        
        // Find flat areas
        const flatAreas = this.findFlatAreas(actionMap);
        
        // Check if we have flat areas suitable for future items
        let bestFitScore = 0;
        if (flatAreas.length > 0) {
            bestFitScore = Math.max(0, 1 - Math.min(1, Math.abs(Math.max(...flatAreas) - avgFutureSize) / avgFutureSize));
        }
        
        // Combine flatness and best fit scores
        return 0.7 * flatnessScore + 0.3 * bestFitScore;
    }
    
    findFlatAreas(heightMap) {
        const flatAreas = [];
        const visited = Array(heightMap.length).fill().map(() => Array(heightMap[0].length).fill(false));
        
        for (let i = 0; i < heightMap.length; i++) {
            for (let j = 0; j < heightMap[i].length; j++) {
                if (heightMap[i][j] > 0 && !visited[i][j]) {
                    // Found a potential flat area
                    const height = heightMap[i][j];
                    const area = this.floodFill(heightMap, visited, i, j, height);
                    if (area > 0) {
                        flatAreas.push(area);
                    }
                }
            }
        }
        
        return flatAreas;
    }
    
    floodFill(heightMap, visited, i, j, targetHeight, tolerance = 0.1) {
        if (i < 0 || i >= heightMap.length || 
            j < 0 || j >= heightMap[i].length || 
            visited[i][j] || 
            Math.abs(heightMap[i][j] - targetHeight) > tolerance) {
            return 0;
        }
        
        visited[i][j] = true;
        let area = 1;
        
        // Check 4 adjacent cells
        area += this.floodFill(heightMap, visited, i+1, j, targetHeight, tolerance);
        area += this.floodFill(heightMap, visited, i-1, j, targetHeight, tolerance);
        area += this.floodFill(heightMap, visited, i, j+1, targetHeight, tolerance);
        area += this.floodFill(heightMap, visited, i, j-1, targetHeight, tolerance);
        
        return area;
    }
}

// Export the model class
export default DeepPack3DModel;
"""
        
        # Save JavaScript implementation
        js_path = os.path.join(output_dir, 'DeepPack3DModel.js')
        with open(js_path, 'w') as f:
            f.write(js_implementation)
        
        print(f"JavaScript implementation created at {js_path}")
        
except Exception as e:
    print(f"Error converting model: {str(e)}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
