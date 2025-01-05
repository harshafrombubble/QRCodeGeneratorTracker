import cv2
import numpy as np
import qrcode
from pyzbar.pyzbar import decode
import fitz  # PyMuPDF
from PIL import Image
import io
import tempfile
import os

def detect_qr_code(image_path):
    """Detect QR code in an image and return its position, size, and properties."""
    # Read the image
    image = cv2.imread(image_path)
    if image is None:
        raise ValueError("Could not read image")

    # Convert to grayscale
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    # Detect QR codes
    qr_codes = decode(gray)
    if not qr_codes:
        raise ValueError("No QR code found in image")

    # Get the first QR code's position and data
    qr = qr_codes[0]
    points = qr.polygon
    if len(points) != 4:
        raise ValueError("Invalid QR code shape detected")

    # Calculate bounding box
    x_coords = [p.x for p in points]
    y_coords = [p.y for p in points]
    left = min(x_coords)
    top = min(y_coords)
    width = max(x_coords) - left
    height = max(y_coords) - top

    # Extract QR code region for analysis
    qr_region = gray[top:top+height, left:left+width]
    
    # Analyze QR code properties
    module_size = estimate_module_size(qr_region)
    border_size = estimate_border_size(qr_region, module_size)
    error_level = get_error_correction_level(qr)

    return {
        'x': left,
        'y': top,
        'width': width,
        'height': height,
        'module_size': module_size,
        'border_size': border_size,
        'error_level': error_level
    }

def estimate_module_size(qr_region):
    """Estimate the size of a single QR code module."""
    # Use edge detection to find transitions
    edges = cv2.Canny(qr_region, 100, 200)
    
    # Count transitions in the middle row and column
    middle_row = edges[edges.shape[0]//2, :]
    middle_col = edges[:, edges.shape[1]//2]
    
    # Calculate average distance between transitions
    row_transitions = np.where(middle_row > 0)[0]
    col_transitions = np.where(middle_col > 0)[0]
    
    if len(row_transitions) > 1 and len(col_transitions) > 1:
        avg_row_dist = np.mean(np.diff(row_transitions))
        avg_col_dist = np.mean(np.diff(col_transitions))
        return int(round((avg_row_dist + avg_col_dist) / 2))
    
    return 10  # Default if estimation fails

def estimate_border_size(qr_region, module_size):
    """Estimate the border size of the QR code."""
    # Find first black pixel from each edge
    height, width = qr_region.shape
    
    # Scan from top
    for y in range(height):
        if any(qr_region[y, :] < 128):  # Found black pixel
            top_border = y
            break
    else:
        top_border = 0
        
    # Calculate border size in modules
    border_size = int(round(top_border / module_size))
    return max(0, min(border_size, 4))  # Clamp between 0 and 4

def get_error_correction_level(qr):
    """Determine error correction level from QR code data."""
    # Try to determine from quality parameter if available
    quality = getattr(qr, 'quality', None)
    if quality is not None:
        if quality >= 3:
            return qrcode.constants.ERROR_CORRECT_H
        elif quality >= 2:
            return qrcode.constants.ERROR_CORRECT_Q
        elif quality >= 1:
            return qrcode.constants.ERROR_CORRECT_M
    
    # Default to L if can't determine
    return qrcode.constants.ERROR_CORRECT_L

def create_qr_code(url, size, properties):
    """Create a QR code image matching the properties of the original."""
    qr = qrcode.QRCode(
        version=None,  # Auto-determine version
        error_correction=properties.get('error_level', qrcode.constants.ERROR_CORRECT_L),
        box_size=properties.get('module_size', 10),
        border=properties.get('border_size', 0),
    )
    qr.add_data(url)
    qr.make(fit=True)

    # Create QR code image
    qr_image = qr.make_image(fill_color="black", back_color="white")
    
    # Resize to match the original QR code size
    qr_image = qr_image.resize((size['width'], size['height']), Image.LANCZOS)
    
    return qr_image

def process_image(input_path, output_path, target_url):
    """Process an image file by replacing its QR code."""
    try:
        # Detect QR code and its properties in the original image
        qr_info = detect_qr_code(input_path)
        
        # Open the original image
        image = Image.open(input_path)
        
        # Create new QR code with matching properties
        new_qr = create_qr_code(target_url, {
            'width': qr_info['width'],
            'height': qr_info['height']
        }, qr_info)
        
        # Paste the new QR code onto the original image
        image.paste(new_qr, (qr_info['x'], qr_info['y']))
        
        # Save the result
        image.save(output_path)
        
    except Exception as e:
        raise Exception(f"Error processing image: {str(e)}")

def replace_qr_in_pdf(input_path, output_path, target_url):
    """Replace QR code in a PDF file."""
    try:
        # Open the PDF
        pdf_doc = fitz.open(input_path)
        
        # Process each page
        for page_num in range(len(pdf_doc)):
            page = pdf_doc[page_num]
            
            # Convert page to image
            pix = page.get_pixmap()
            img_data = pix.tobytes("png")
            
            # Save temporary image
            with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as temp_img:
                temp_img.write(img_data)
                temp_img_path = temp_img.name
            
            try:
                # Detect QR code and its properties
                qr_info = detect_qr_code(temp_img_path)
                
                # Create new QR code with matching properties
                new_qr = create_qr_code(target_url, {
                    'width': qr_info['width'],
                    'height': qr_info['height']
                }, qr_info)
                
                # Convert QR code to bytes
                qr_bytes = io.BytesIO()
                new_qr.save(qr_bytes, format='PNG')
                qr_bytes = qr_bytes.getvalue()
                
                # Insert new QR code into PDF
                page.insert_image(
                    fitz.Rect(
                        qr_info['x'],
                        qr_info['y'],
                        qr_info['x'] + qr_info['width'],
                        qr_info['y'] + qr_info['height']
                    ),
                    stream=qr_bytes
                )
                
            finally:
                # Clean up temporary image
                try:
                    os.unlink(temp_img_path)
                except:
                    pass
        
        # Save the modified PDF
        pdf_doc.save(output_path)
        pdf_doc.close()
        
    except Exception as e:
        raise Exception(f"Error processing PDF: {str(e)}") 