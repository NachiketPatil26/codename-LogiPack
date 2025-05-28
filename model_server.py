# Configure TensorFlow for Apple Silicon
import os
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'  # Suppress TensorFlow logging

# Import TensorFlow - for Apple Silicon, use tensorflow-macos
tf = None
model = None
try:
    import tensorflow as tf
    print(f"TensorFlow version: {tf.__version__}")
    # Check if Metal is available (Apple Silicon GPU)
    if tf.config.list_physical_devices('GPU'):
        print("Metal GPU acceleration is available")
        # Enable memory growth to prevent TensorFlow from allocating all GPU memory
        for gpu in tf.config.list_physical_devices('GPU'):
            tf.config.experimental.set_memory_growth(gpu, True)
    else:
        print("Metal GPU acceleration is not available, using CPU only")
except ImportError:
    print("Warning: TensorFlow not available. Running in fallback mode.")
    print("For full functionality, install TensorFlow: pip install tensorflow-macos tensorflow-metal")
import numpy as np
from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import logging
import traceback

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("model_server.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Load the model
try:
    if tf is not None:
        model_path = os.path.join(os.path.dirname(__file__), 'DeepPack3D/models/k=5.h5')
        if not os.path.exists(model_path):
            logger.warning(f"Model file not found at {model_path}")
            logger.warning("Running in fallback mode with heuristic predictions")
        else:    
            logger.info(f"Loading model from {model_path}")
            model = tf.keras.models.load_model(model_path)
            
            # Log model summary
            model.summary(print_fn=logger.info)
            logger.info("Model loaded successfully")
    else:
        logger.warning("TensorFlow not available, running in fallback mode")
        logger.warning("Will use heuristic predictions instead of ML model")
        model = None
    
except Exception as e:
    logger.error(f"Error loading model: {str(e)}")
    logger.error(traceback.format_exc())
    model = None

@app.route('/predict', methods=['POST'])
def predict():
    try:
        # Get data from request
        data = request.json
        logger.info(f"Received prediction request")
        
        # Extract input features
        const_in = np.array(data['const_in'])
        hmap_in = np.array(data['hmap_in'])
        amap_in = np.array(data['amap_in'])
        imap_in = np.array(data['imap_in'])
        
        # If model is available, use it for prediction
        if model is not None and tf is not None:
            try:
                # Ensure correct shapes for the k=5.h5 model
                # The model expects specific input shapes
                const_in = const_in[..., None]  # Shape: (batch_size, 32, 32, 1)
                hmap_in = hmap_in[..., None]    # Shape: (batch_size, 32, 32, 1)
                amap_in = amap_in[..., None]    # Shape: (batch_size, 32, 32, 1)
                
                # For the k=5 model, we need 4 items in the lookahead
                # Make sure imap_in has shape (batch_size, 4, 3)
                if imap_in.shape[1] < 4:
                    # Pad with zeros if we have fewer than 4 items
                    padding = np.zeros((imap_in.shape[0], 4 - imap_in.shape[1], 3))
                    imap_in = np.concatenate([imap_in, padding], axis=1)
                elif imap_in.shape[1] > 4:
                    # Truncate if we have more than 4 items
                    imap_in = imap_in[:, :4, :]
                    
                logger.info(f"Processed input shapes: const_in={const_in.shape}, hmap_in={hmap_in.shape}, amap_in={amap_in.shape}, imap_in={imap_in.shape}")
                
                # Make prediction
                prediction = model.predict([const_in, hmap_in, amap_in, imap_in], verbose=0)
                
                # Log prediction shape and sample values
                logger.info(f"Prediction shape: {prediction.shape}, sample values: {prediction[0][:5] if prediction.size > 5 else prediction}")
                
                # Return prediction as JSON
                return jsonify({
                    'prediction': prediction.tolist(),
                    'status': 'success'
                })
            except Exception as e:
                logger.error(f"Error during model prediction: {str(e)}")
                logger.error(traceback.format_exc())
                logger.warning("Falling back to heuristic prediction")
                # Fall through to heuristic prediction
        
        # Fallback: Use heuristic prediction
        logger.info("Using heuristic prediction (model not available)")
        
        # Extract height map and action map for heuristic calculation
        height_map = hmap_in[0]
        action_map = amap_in[0]
        
        # 1. Calculate height utilization
        current_max_height = np.max(height_map)
        action_max_height = np.max(action_map)
        height_utilization = min(1.0, action_max_height)
        
        # 2. Calculate support score - how well the item is supported
        # Find the area where action is placed
        action_area = (action_map > height_map).astype(float)
        support_area = (np.abs(action_map - height_map) < 0.01).astype(float)
        support_score = np.sum(support_area) / (np.sum(action_area) + 1e-6)
        
        # 3. Calculate compactness - how close to other items
        occupied_cells = (height_map > 0).astype(float)
        action_cells = (action_map > 0).astype(float)
        compactness = np.sum(occupied_cells * action_cells) / (np.sum(action_cells) + 1e-6)
        
        # Combined heuristic score
        heuristic_score = 0.5 * height_utilization + 0.3 * support_score + 0.2 * compactness
        
        logger.info(f"Heuristic prediction: {heuristic_score}")
        
        # Return heuristic prediction
        return jsonify({
            'prediction': [[float(heuristic_score)]],  # Match the model output format
            'status': 'success',
            'method': 'heuristic'
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
        'model': 'k=5.h5',
        'version': '1.0.0'
    })

if __name__ == '__main__':
    # Use port 5001 instead of 5000 (which is often used by AirPlay on macOS)
    app.run(host='0.0.0.0', port=5001, debug=True)
