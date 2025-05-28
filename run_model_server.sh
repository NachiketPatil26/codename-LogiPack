#!/bin/bash

# Install required dependencies for the Python-based implementation
echo "Installing dependencies for Python-based implementation..."

# Create and activate virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
  echo "Creating new virtual environment..."
  python3 -m venv venv
fi

source venv/bin/activate

# Install dependencies
pip install flask flask-cors numpy h5py

# For Apple Silicon (M1/M2) Macs
if [[ $(uname -m) == 'arm64' ]]; then
  echo "Detected Apple Silicon, installing compatible dependencies..."
  pip install tensorflow-macos tensorflow-metal
else
  echo "Installing TensorFlow for Intel processors..."
  pip install tensorflow
fi

# Check if the model file exists
if [ ! -f "DeepPack3D/models/k=5.h5" ]; then
  echo "Model file not found at DeepPack3D/models/k=5.h5"
  echo "Creating models directory if it doesn't exist..."
  mkdir -p DeepPack3D/models
  
  # If you have the model file elsewhere, uncomment and modify this line:
  # cp /path/to/your/k=5.h5 DeepPack3D/models/
  
  echo "Please ensure the model file k=5.h5 is placed in the DeepPack3D/models/ directory"
  echo "If you don't have the model file, the server will run in fallback mode"
fi

# Run the model server
echo "Starting Flask server on http://localhost:5001"
python model_server.py

# Deactivate the virtual environment when the server stops
deactivate
