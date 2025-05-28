# DeepPack3D Reinforcement Learning Integration Guide

This guide explains how to use the Python-based reinforcement learning implementation with your 3D bin packing project.

## Overview

The integration allows your application to use an intelligent packing algorithm that optimizes 3D bin packing. The algorithm is designed to:

1. Prevent floating boxes (each box must have at least 50% support from below)
2. Maximize space utilization
3. Ensure boxes don't overlap
4. Keep all boxes within container boundaries
5. Optimize for compactness (items placed close together)

## Setup Instructions

### Step 1: Start the Python Packer Server

The server is a Python Flask application that implements a reinforcement learning-like algorithm without requiring TensorFlow, making it compatible with Apple Silicon (M1/M2) Macs.

```bash
# Make the script executable
chmod +x run_model_server.sh

# Run the server
./run_model_server.sh
```

The server will start on http://localhost:5000 and use a pure Python implementation to evaluate packing decisions.

### Step 2: Use the Reinforcement Learning Algorithm

In your application, select the "Reinforcement Learning" algorithm from the dropdown menu. The application will:

1. Connect to the model server
2. Generate valid positions and rotations for each item
3. Use the model to predict the best position and rotation
4. Place the item and continue with the next one

If the model server is not available, the application will fall back to a heuristic approach that still enforces stability and space utilization constraints.

## How It Works

### Input to the Model

For each potential placement of an item, the model receives:

1. **Height Map (32x32)**: Current state of the container
2. **Action Map (32x32)**: What the container would look like after placing the item
3. **Item Features**: Dimensions of the next few items to be packed
4. **Constant Map**: A map of ones used for normalization

### Output from the Model

The model outputs a Q-value for each potential placement. The placement with the highest Q-value is selected.

### Fallback Mechanism

If the model server is unavailable, the application uses a heuristic approach that considers:

1. Stability score (50% of the decision weight)
2. Space utilization score (30% of the decision weight)
3. Compactness score (20% of the decision weight)

## Troubleshooting

### Model Server Issues

If you encounter issues with the model server:

1. Check if the model file exists at `DeepPack3D/models/k=5.h5`
2. Check the model server logs in `model_server.log`
3. Ensure you have the required Python dependencies installed:
   ```bash
   pip install tensorflow flask flask-cors
   ```

### Application Issues

If the reinforcement learning algorithm is not working correctly:

1. Check the browser console for errors
2. Verify that the model server is running
3. Try the fallback heuristic approach by disconnecting the model server

## Advanced Configuration

### Model Server Configuration

You can modify the model server configuration in `model_server.py`:

- Change the port by modifying the `app.run()` call
- Adjust logging settings in the `logging.basicConfig()` call
- Change the model path if you have a different model file

### Client Configuration

You can modify the client configuration in `src/utils/modelService.ts`:

- Change the API URL in the `BinPackingModelService` constructor
- Adjust the feature calculation in the `prepareModelInputs` method
- Modify the fallback heuristic weights in the `reinforcementLearningPacker.ts` file

## Performance Considerations

The reinforcement learning algorithm may be slower than other algorithms due to:

1. Network latency when communicating with the model server
2. The need to evaluate multiple potential placements

For large packing problems, consider:

1. Limiting the number of items to pack
2. Using a more powerful machine for the model server
3. Optimizing the feature calculation in `modelService.ts`

## Future Improvements

The current integration can be improved by:

1. Converting the model to TensorFlow.js format for client-side inference
2. Implementing batched predictions for better performance
3. Adding more features to the model input for better decision-making
4. Fine-tuning the model on your specific packing problems
