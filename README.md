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

## Deployment

### Building the Docker Image

1. Build the Docker image:
```bash
docker build -t qr-campaign-manager .
```

2. Test locally:
```bash
docker run -p 3000:3000 -p 8000:8000 \
  -e NEXT_PUBLIC_SUPABASE_URL=your_supabase_url \
  -e NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key \
  -e AWS_ACCESS_KEY_ID=your_aws_access_key \
  -e AWS_SECRET_ACCESS_KEY=your_aws_secret_key \
  -e AWS_DEFAULT_REGION=your_aws_region \
  -e AWS_BUCKET_NAME=your_bucket_name \
  qr-campaign-manager
```

### Deploying to AWS

1. Install the AWS CLI and configure it with your credentials.

2. Create an ECR repository:
```bash
aws ecr create-repository --repository-name qr-campaign-manager
```

3. Login to ECR:
```bash
aws ecr get-login-password --region your-region | docker login --username AWS --password-stdin your-account-id.dkr.ecr.your-region.amazonaws.com
```

4. Tag and push the image:
```bash
docker tag qr-campaign-manager:latest your-account-id.dkr.ecr.your-region.amazonaws.com/qr-campaign-manager:latest
docker push your-account-id.dkr.ecr.your-region.amazonaws.com/qr-campaign-manager:latest
```

5. Create an ECS cluster:
```bash
aws ecs create-cluster --cluster-name qr-campaign-cluster
```

6. Create a task definition (save as task-definition.json):
```json
{
  "family": "qr-campaign-task",
  "networkMode": "awsvpc",
  "containerDefinitions": [
    {
      "name": "qr-campaign-app",
      "image": "your-account-id.dkr.ecr.your-region.amazonaws.com/qr-campaign-manager:latest",
      "portMappings": [
        {
          "containerPort": 3000,
          "protocol": "tcp"
        },
        {
          "containerPort": 8000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "NEXT_PUBLIC_SUPABASE_URL",
          "value": "your_supabase_url"
        },
        {
          "name": "NEXT_PUBLIC_SUPABASE_ANON_KEY",
          "value": "your_supabase_anon_key"
        }
      ],
      "secrets": [
        {
          "name": "AWS_ACCESS_KEY_ID",
          "valueFrom": "arn:aws:ssm:region:account-id:parameter/qr-campaign/aws-access-key-id"
        },
        {
          "name": "AWS_SECRET_ACCESS_KEY",
          "valueFrom": "arn:aws:ssm:region:account-id:parameter/qr-campaign/aws-secret-access-key"
        }
      ]
    }
  ],
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512"
}
```

7. Register the task definition:
```bash
aws ecs register-task-definition --cli-input-json file://task-definition.json
```

8. Create an Application Load Balancer and target groups for both ports (3000 and 8000).

9. Create an ECS service:
```bash
aws ecs create-service \
  --cluster qr-campaign-cluster \
  --service-name qr-campaign-service \
  --task-definition qr-campaign-task \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxxxx],securityGroups=[sg-xxxxx],assignPublicIp=ENABLED}" \
  --load-balancers "[{targetGroupArn=arn:aws:elasticloadbalancing:region:account-id:targetgroup/qr-campaign-tg/xxxxx,containerName=qr-campaign-app,containerPort=3000}]"
```

### Setting up the Domain

1. In Route 53, create an A record for bd-qr.com pointing to your Application Load Balancer:
   - Click on your hosted zone
   - Click "Create Record"
   - Choose "A - Routes traffic to an IPv4 address and some AWS resources"
   - Toggle "Alias"
   - Choose your Application Load Balancer as the target
   - Click "Create records"

2. Create a certificate in AWS Certificate Manager (ACM):
   - Request a certificate for *.bd-qr.com and bd-qr.com
   - Use DNS validation
   - Add the validation CNAME records to Route 53
   - Wait for validation to complete

3. Add the certificate to your Application Load Balancer:
   - Go to EC2 > Load Balancers
   - Select your load balancer
   - Add HTTPS listener (port 443)
   - Choose your ACM certificate
   - Update security groups to allow HTTPS traffic

4. (Optional) Set up a redirect from HTTP to HTTPS:
   - Add a listener rule to redirect HTTP traffic to HTTPS

Your application should now be accessible at https://bd-qr.com, with only the Next.js frontend being publicly accessible while the Python API is only accessible internally through the load balancer.
