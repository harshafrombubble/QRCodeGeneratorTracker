from fastapi import FastAPI, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
import os
import tempfile
from replace_qr import replace_qr_in_pdf, process_image
import fitz  # PyMuPDF
from PIL import Image
import mimetypes

app = FastAPI()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

def is_pdf(filename: str) -> bool:
    return filename.lower().endswith('.pdf')

def is_image(filename: str) -> bool:
    ext = filename.lower().split('.')[-1]
    return ext in ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'tiff']

def get_content_type(filename: str) -> str:
    content_type, _ = mimetypes.guess_type(filename)
    return content_type or 'application/octet-stream'

@app.post("/process-file")
async def process_file(file: UploadFile, target_url: str = Form(...)):
    if not file:
        raise HTTPException(status_code=400, detail="No file provided")
    if not target_url:
        raise HTTPException(status_code=400, detail="No target URL provided")

    # Create a temporary directory for processing
    with tempfile.TemporaryDirectory() as temp_dir:
        try:
            # Save uploaded file
            input_path = os.path.join(temp_dir, file.filename)
            output_path = os.path.join(temp_dir, f"processed_{file.filename}")
            
            with open(input_path, "wb") as f:
                f.write(await file.read())

            # Process file based on type
            if is_pdf(file.filename):
                # Process PDF
                replace_qr_in_pdf(input_path, output_path, target_url)
            elif is_image(file.filename):
                # Process image
                process_image(input_path, output_path, target_url)
            else:
                raise HTTPException(status_code=400, detail="Unsupported file type")

            # Read the processed file
            with open(output_path, "rb") as f:
                processed_file = f.read()

            # Return the file with appropriate content type
            content_type = get_content_type(file.filename)
            return Response(
                content=processed_file,
                media_type=content_type,
                headers={
                    'Content-Disposition': f'attachment; filename="processed_{file.filename}"'
                }
            )

        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

@app.get("/")
async def root():
    """Welcome endpoint with API information."""
    return {
        "message": "Welcome to QR Code Processor API",
        "usage": {
            "endpoint": "/process-file",
            "method": "POST",
            "parameters": {
                "file": "Upload a PDF or image file containing a QR code",
                "target_url": "The new URL to encode in the QR code"
            }
        }
    } 