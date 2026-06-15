# AWS Production Deployment Guide: StudentVault

This document details the step-by-step production deployment guide for the StudentVault Node.js Express REST API backend on AWS.

---

## 1. Amazon RDS (MySQL) Provisioning

1. **Create Subnet Groups**: Establish database subnet groups across multiple Availability Zones (AZ) for high-availability.
2. **Launch RDS Instance**:
   - **Engine**: MySQL 8.x
   - **Templates**: Production (Multi-AZ Deployment)
   - **Instance Class**: `db.t3.micro` or `db.t3.medium` (depending on scaling needs)
3. **Security Group Settings**:
   - Restrict port `3306` inbound rules. Only accept traffic originating from the security group of your EC2 backend instances. **Never expose port 3306 publicly.**
4. **Initialization & Migration**:
   - Retrieve the database host endpoint (`xxxx.xxxx.us-east-1.rds.amazonaws.com`).
   - Run migrations from your deployment pipeline or bastian host using:
     ```bash
     DB_HOST=your-rds-endpoint DB_USER=admin DB_PASSWORD=your-secure-password node src/models/migrate.js
     ```

---

## 2. Amazon S3 Configuration

1. **Bucket Creation**: Create a private bucket named `studentvault-bucket`.
2. **Block Public Access**: Enable **Block *all* public access** to protect file privacy. Public access is strictly forbidden; all public downloads are routed through secure pre-signed URLs generated on-the-fly by the application.
3. **CORS Rules**: Add standard CORS JSON permissions to the S3 bucket to allow client downloads:
   ```json
   [
     {
       "AllowedHeaders": ["*"],
       "AllowedMethods": ["GET", "PUT", "POST", "HEAD"],
       "AllowedOrigins": ["https://studentvault.yourdomain.com"],
       "ExposeHeaders": ["ETag"]
     }
   ]
   ```

---

## 3. Security & IAM (Least Privilege Policies)

Instead of hardcoding `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` in environment files on the server (which violates security best practices), attach an **IAM Instance Profile Role** to the EC2 instances.

### IAM Policy Definition for StudentVault S3 Access
Create a custom IAM policy and attach it to the EC2 execution role:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "S3StudentVaultAccess",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::studentvault-bucket/users/*"
    }
  ]
}
```

---

## 4. Amazon EC2 Deployment & PM2

### Infrastructure Setup
1. Launch an EC2 instance (`t3.small`) running **Ubuntu Server 22.04 LTS**.
2. Mount the **IAM Instance Profile Role** created in the previous step onto the instance.
3. Configure security groups:
   - Port `22` (SSH): Restrict to your corporate IP range.
   - Port `80`/`443` (HTTP/S): Open to the world (`0.0.0.0/0`).

### Code Deployment Flow
Connect to your EC2 instance via SSH and run:
```bash
# 1. Update OS packages
sudo apt update && sudo apt upgrade -y

# 2. Install Node.js (via NVM)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 20

# 3. Clone Repository
git clone https://github.com/your-username/studentvault-backend.git /var/www/studentvault
cd /var/www/studentvault
npm install --production

# 4. Install PM2 globally
npm install pm2 -g
```

### PM2 Process Management
Create an `ecosystem.config.js` file in the root folder to manage Node processes:
```javascript
module.exports = {
  apps: [{
    name: 'studentvault-api',
    script: './src/server.js',
    instances: 'max', // Enable clustering to run across all CPU cores
    exec_mode: 'cluster',
    env_production: {
      NODE_ENV: 'production',
      PORT: 5000,
      DB_HOST: 'your-rds-endpoint.amazonaws.com',
      DB_PORT: 3306,
      DB_USER: 'studentvault_admin',
      DB_NAME: 'studentvault',
      JWT_EXPIRES_IN: '7d',
      AWS_S3_BUCKET_NAME: 'studentvault-bucket',
      AWS_REGION: 'us-east-1',
      CORS_ORIGIN: 'https://studentvault.yourdomain.com'
      // Note: JWT_SECRET and DB_PASSWORD should be injected via EC2 Environment variables or AWS Parameter Store
    }
  }]
};
```

Launch the cluster:
```bash
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup systemd
```

---

## 5. Nginx Reverse Proxy Setup

To route internet traffic from port `80`/`443` down to the Express app port `5000` safely:

1. Install Nginx:
   ```bash
   sudo apt install nginx -y
   ```
2. Configure virtual host `/etc/nginx/sites-available/studentvault`:
   ```nginx
   server {
       listen 80;
       server_name api.studentvault.yourdomain.com;

       location / {
           proxy_pass http://localhost:5000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   ```
3. Enable host and reload Nginx:
   ```bash
   sudo ln -s /etc/nginx/sites-available/studentvault /etc/nginx/sites-enabled/
   sudo systemctl restart nginx
   ```
4. Secure connections with Let's Encrypt SSL:
   ```bash
   sudo apt install certbot python3-certbot-nginx -y
   sudo certbot --nginx -d api.studentvault.yourdomain.com
   ```

---

## 6. Amazon CloudWatch & Monitoring

1. **Winston Logger Streams**:
   Winston outputs JSON logs to `stdout`/`stderr` in production mode.
2. **Install CloudWatch Agent**:
   Install the unified CloudWatch agent on the EC2 instance to fetch system logs and application console output directly.
3. Configure the CloudWatch Agent config file (`/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json`) to forward PM2 logs:
   ```json
   {
     "logs": {
       "logs_collected": {
         "files": {
           "collect_list": [
             {
               "file_path": "/home/ubuntu/.pm2/logs/studentvault-api-out.log",
               "log_group_name": "studentvault-backend",
               "log_stream_name": "app-info-logs"
             },
             {
               "file_path": "/home/ubuntu/.pm2/logs/studentvault-api-error.log",
               "log_group_name": "studentvault-backend",
               "log_stream_name": "app-error-logs"
             }
           ]
         }
       }
     }
   }
   ```

---

## 7. Amazon CloudFront Integration

To cache static requests or serve client uploads with low latency:
1. **Create CloudFront Distribution**: Set the origin to point to your S3 bucket.
2. **Restrict S3 access via OAC (Origin Access Control)**: Restrict the S3 bucket to only allow read requests coming from CloudFront.
3. **Pre-signed URLs mapping**: Pre-signed URLs created in code automatically direct down to S3 bucket keys. If required, you can map pre-signed endpoints to leverage CloudFront domain urls (`https://cdn.studentvault.com/users/...`) instead of native S3 urls by modifying your S3 client endpoint settings.
