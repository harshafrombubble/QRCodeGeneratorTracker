#!/bin/bash

# Start Python API in the background
cd python
python -m uvicorn api:app --host 0.0.0.0 --port 8000 &

# Start Next.js app
cd ..
npm start 