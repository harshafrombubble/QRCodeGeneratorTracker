# Bubble Date QR Tracker

Bubble Date QR Tracker is a web application that allows you to modify the target URL of QR codes in uploaded files. This tool supports various file formats, including PDF, PNG, JPG, JPEG, BMP, and TIFF. The application maintains the original appearance and positioning of the QR code in the modified file. And it allows for advanced link tracking

## Features
- Create campaign specific a new target url
- Upload PDF or image files containing QR codes
- Download the modified file with the updated QR code
- Supports PDF, PNG, JPG, JPEG, BMP, and TIFF formats
- Maintains the original appearance and positioning of the QR code

## Installation

1. Clone the repository
2. Install the requirements:
   ```bash
   pip install -r requirements.txt
   ```

## Running the Application

1. Start the Django development server:
   ```bash
   python manage.py runserver
   ```
2. Open your web browser and navigate to `http://localhost:8000`

## Usage

### Creating QR Codes
1. Access the web interface at `http://localhost:8000`
2. Upload a file containing a QR code
3. Enter the new URL you want to encode in the QR code
4. Click "Process File" to generate the modified file
5. The modified file will be automatically downloaded

### Tracking Links
1. For each campaign you create a new target url
2. For each flyer you track
    1. Dynamic QR code is generated with the c



## Supported File Types

- PDF
- PNG
- JPG/JPEG
- BMP
- TIFF

## Requirements

See `requirements.txt` for a complete list of dependencies. 