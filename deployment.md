# Mini Google Drive Backend Deployment

This backend is built with Node.js, Express, MongoDB Atlas via Mongoose, and Amazon S3 using the AWS SDK v3.

## Environment Variables

Create a `.env` file based on `.env.example`:

```env
MONGODB_URI=<mongodb atlas uri>
JWT_SECRET=<jwt secret>
AWS_REGION=eu-north-1
AWS_S3_BUCKET_NAME=gd-miniproject
PORT=5000
```

Optional:

```env
NODE_ENV=production
HOST=0.0.0.0
JWT_EXPIRES_IN=7d
CORS_ORIGIN=https://your-frontend-domain.vercel.app
```

## MongoDB Atlas

1. Create a MongoDB Atlas cluster.
2. Add the EC2 outbound IP or VPC egress IP to the Atlas network access list.
3. Create a database user with read/write access to your application database.
4. Set `MONGODB_URI` in the environment.

The application fails startup if MongoDB connection cannot be established.

## Amazon S3

Bucket details:

- Bucket name: `gd-miniproject`
- Region: `eu-north-1`

The app uses the AWS default credential provider chain. On EC2, attach an IAM role with S3 permissions instead of setting `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`.

Example IAM policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::gd-miniproject",
        "arn:aws:s3:::gd-miniproject/*"
      ]
    }
  ]
}
```

The server verifies bucket access during startup.

## EC2 Deployment

1. Install Node.js 18 or later.
2. Copy the backend code to the EC2 instance.
3. Run:

```bash
npm install
npm start
```

4. Keep the process alive using PM2 if desired:

```bash
npm install -g pm2
pm2 start src/server.js --name gd-backend
pm2 save
```

## Nginx Reverse Proxy

Example configuration:

```nginx
server {
    listen 80;
    server_name api.example.com;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Health Check

`GET /health`

Response:

```json
{
  "status": "UP",
  "message": "Backend Running"
}
```
