import numpy as np
from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import logging
import traceback
import json
import math

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("packer_server.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Pure Python implementation of the 3D bin packing algorithm
class PythonBinPacker:
    def __init__(self):
        logger.info("Initializing Python-based bin packer")
        self.grid_size = 32  # Size of the grid for state representation
        
    def predict(self, const_in, hmap_in, amap_in, imap_in):
        """
        Predict the Q-value for a given state-action pair
        
        This is a pure Python implementation that replaces the TensorFlow model
        """
        try:
            # Extract features from the input
            height_map = np.array(hmap_in)[0]  # Current height map
            action_map = np.array(amap_in)[0]  # Proposed action
            item_features = np.array(imap_in)[0]  # Next items to pack
            
            # Calculate features for the Q-value prediction
            
            # 1. Height utilization - how well does this utilize the height?
            current_max_height = np.max(height_map)
            action_max_height = np.max(action_map)
            height_utilization = min(1.0, action_max_height)  # Normalized to [0,1]
            
            # 2. Height variance - lower is better (more even surface)
            height_variance = np.var(action_map) / 0.25  # Normalize variance
            height_variance_score = max(0, 1 - height_variance)  # Invert so lower variance is better
            
            # 3. Support percentage - how well is the item supported from below?
            support_score = self._calculate_support_score(height_map, action_map)
            
            # 4. Compactness - how close is this to other items?
            compactness_score = self._calculate_compactness(action_map)
            
            # 5. Future items consideration - how well does this placement work with future items?
            future_items_score = self._evaluate_future_items(action_map, item_features)
            
            # Combine all scores with appropriate weights
            q_value = (
                0.3 * height_utilization +      # Utilize height
                0.2 * height_variance_score +   # Even surface
                0.3 * support_score +           # Stability
                0.1 * compactness_score +       # Compactness
                0.1 * future_items_score        # Future items
            )
            
            logger.info(f"Calculated Q-value: {q_value}")
            return q_value
            
        except Exception as e:
            logger.error(f"Error in predict: {str(e)}")
            logger.error(traceback.format_exc())
            return 0.0  # Default value in case of error
    
    def _calculate_support_score(self, height_map, action_map):
        """Calculate how well an item is supported from below"""
        try:
            # Find cells where the action adds height
            action_cells = action_map > height_map
            if not np.any(action_cells):
                return 1.0  # No new cells, perfect support
                
            # Find the base of the item (cells where the item starts)
            base_mask = np.zeros_like(action_map, dtype=bool)
            
            # For each column in the grid
            for i in range(self.grid_size):
                for j in range(self.grid_size):
                    if action_map[i, j] > height_map[i, j]:
                        # This is part of the item
                        base_mask[i, j] = True
                        # If we find a cell with higher value in the same column, this isn't a base cell
                        for ii in range(self.grid_size):
                            for jj in range(self.grid_size):
                                if (ii != i or jj != j) and action_map[ii, jj] > action_map[i, j]:
                                    # Check if this is directly above
                                    if abs(ii - i) <= 1 and abs(jj - j) <= 1:
                                        base_mask[i, j] = False
                                        break
            
            # Count base cells
            base_cells = np.sum(base_mask)
            if base_cells == 0:
                return 0.0  # No base cells found, item is floating
                
            # Count supported base cells (where height_map is close to the action_map)
            supported_mask = base_mask & (action_map - height_map < 0.1)
            supported_cells = np.sum(supported_mask)
            
            # Calculate support percentage
            support_percentage = supported_cells / base_cells
            
            # Require at least 50% support
            if support_percentage < 0.5:
                return 0.1 * (support_percentage / 0.5)  # Heavily penalize < 50% support
                
            return support_percentage
            
        except Exception as e:
            logger.error(f"Error in _calculate_support_score: {str(e)}")
            return 0.5  # Default to moderate support in case of error
    
    def _calculate_compactness(self, action_map):
        """Calculate how compact the placement is"""
        try:
            # Find non-zero cells (occupied space)
            occupied = action_map > 0
            if not np.any(occupied):
                return 0.0  # No occupied cells
                
            # Calculate the bounding box of the occupied space
            occupied_indices = np.where(occupied)
            min_i, max_i = np.min(occupied_indices[0]), np.max(occupied_indices[0])
            min_j, max_j = np.min(occupied_indices[1]), np.max(occupied_indices[1])
            
            # Calculate bounding box volume
            bbox_volume = (max_i - min_i + 1) * (max_j - min_j + 1) * np.max(action_map)
            
            # Calculate actual occupied volume
            occupied_volume = np.sum(action_map)
            
            # Calculate compactness as ratio of occupied volume to bounding box volume
            if bbox_volume > 0:
                compactness = occupied_volume / bbox_volume
                return compactness
            else:
                return 0.0
                
        except Exception as e:
            logger.error(f"Error in _calculate_compactness: {str(e)}")
            return 0.5  # Default to moderate compactness in case of error
    
    def _evaluate_future_items(self, action_map, item_features):
        """Evaluate how well this placement works with future items"""
        try:
            if len(item_features) == 0:
                return 1.0  # No future items to consider
                
            # Calculate the flatness of the top surface
            # A flat surface is better for placing future items
            non_zero_heights = action_map[action_map > 0]
            if len(non_zero_heights) == 0:
                return 0.5  # No occupied space
                
            height_std = np.std(non_zero_heights)
            flatness_score = math.exp(-height_std)  # Higher for flatter surfaces
            
            # Consider the sizes of future items
            future_items_sizes = [item[0] * item[1] * item[2] for item in item_features if sum(item) > 0]
            if not future_items_sizes:
                return flatness_score  # No valid future items
                
            # Calculate average size of future items
            avg_future_size = sum(future_items_sizes) / len(future_items_sizes)
            
            # Calculate available flat areas
            flat_areas = self._find_flat_areas(action_map)
            
            # Check if we have flat areas suitable for future items
            if flat_areas:
                best_fit_score = max(0, 1 - min(1, abs(max(flat_areas) - avg_future_size) / avg_future_size))
            else:
                best_fit_score = 0
                
            # Combine flatness and best fit scores
            return 0.7 * flatness_score + 0.3 * best_fit_score
            
        except Exception as e:
            logger.error(f"Error in _evaluate_future_items: {str(e)}")
            return 0.5  # Default to moderate score in case of error
    
    def _find_flat_areas(self, height_map):
        """Find flat areas in the height map"""
        flat_areas = []
        visited = np.zeros_like(height_map, dtype=bool)
        
        for i in range(self.grid_size):
            for j in range(self.grid_size):
                if height_map[i, j] > 0 and not visited[i, j]:
                    # Found a potential flat area
                    height = height_map[i, j]
                    area = self._flood_fill(height_map, visited, i, j, height)
                    if area > 0:
                        flat_areas.append(area)
        
        return flat_areas
    
    def _flood_fill(self, height_map, visited, i, j, target_height, tolerance=0.1):
        """Use flood fill to find connected cells with similar height"""
        if (i < 0 or i >= self.grid_size or 
            j < 0 or j >= self.grid_size or 
            visited[i, j] or 
            abs(height_map[i, j] - target_height) > tolerance):
            return 0
            
        visited[i, j] = True
        area = 1
        
        # Check 4 adjacent cells
        area += self._flood_fill(height_map, visited, i+1, j, target_height, tolerance)
        area += self._flood_fill(height_map, visited, i-1, j, target_height, tolerance)
        area += self._flood_fill(height_map, visited, i, j+1, target_height, tolerance)
        area += self._flood_fill(height_map, visited, i, j-1, target_height, tolerance)
        
        return area

# Initialize the packer
packer = PythonBinPacker()
logger.info("Python-based bin packer initialized")

@app.route('/predict', methods=['POST'])
def predict():
    try:
        # Get data from request
        data = request.json
        logger.info(f"Received prediction request with data shapes: {[k + ': ' + str(np.array(v).shape) for k, v in data.items()]}")
        
        # Extract input features
        const_in = np.array(data['const_in'])
        hmap_in = np.array(data['hmap_in'])
        amap_in = np.array(data['amap_in'])
        imap_in = np.array(data['imap_in'])
        
        # For the pure Python implementation, we need to ensure the shapes are correct
        # but we don't need to add the extra dimension that TensorFlow would require
        
        # Make prediction using our Python implementation
        q_value = packer.predict(const_in, hmap_in, amap_in, imap_in)
        
        # Return prediction as JSON
        return jsonify({
            'prediction': [[q_value]],  # Match the format expected by the client
            'status': 'success'
        })
    except Exception as e:
        logger.error(f"Error during prediction: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({
            'error': str(e),
            'status': 'error'
        }), 500

@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        'status': 'healthy',
        'model': 'python-implementation',
        'version': '1.0.0'
    })

if __name__ == '__main__':
    logger.info("Starting Python-based bin packer server")
    app.run(host='0.0.0.0', port=5000, debug=True)
