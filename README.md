# QR Code Campaign Manager

This application consists of two parts:
1. A Next.js frontend application for managing QR code campaigns
2. A Python FastAPI backend for processing QR codes in files

## Prerequisites

- Node.js 18+ and npm
- Python 3.8+
- PowerShell (Windows)

## Installation

1. Install Python dependencies:
```bash
cd python
pip install -r requirements.txt
cd ..
```

2. Install Next.js dependencies:
```bash
cd qr-campaign-next
npm install
cd ..
```

## Running the Application

### Option 1: Using the Development Script (Recommended)

Run both services with a single command:

```powershell
./dev.ps1
```

This will start:
- Python API on http://127.0.0.1:8000
- Next.js app on http://localhost:3000

### Option 2: Running Services Separately

1. Start the Python API:
```bash
cd python
python -m uvicorn api:app --reload --port 8000 --host 0.0.0.0
```

2. In a separate terminal, start the Next.js app:
```bash
cd qr-campaign-next
npm run dev
```

## Environment Variables

### Next.js App
Create a `.env.local` file in the `qr-campaign-next` directory:

```env
PYTHON_API_URL=http://127.0.0.1:8000
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_DEFAULT_REGION=your_aws_region
AWS_BUCKET_NAME=your_bucket_name
```

## Usage

1. Open http://localhost:3000 in your browser
2. Sign in or create an account
3. Create a new campaign by uploading a PDF or image file containing a QR code
4. The application will automatically:
   - Detect QR codes in your file
   - Replace them with tracking URLs
   - Create multiple versions for campaign tracking
   - Store the processed files in S3
   - Track scans and provide analytics
