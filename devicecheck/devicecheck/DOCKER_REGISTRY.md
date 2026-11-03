# Docker Private Registry Guide

This guide explains how to build, push, and pull Docker images to/from the private registry at `10.31.20.17:5000`.

## One-Time Setup

### Step 1: Install the Registry Certificate

Since your registry uses a self-signed certificate, you need to add it to Docker's trusted certificates.

**On macOS:**

1. Copy the certificate file to Docker's certificate directory:
   ```bash
   # Create the directory for your registry
   sudo mkdir -p /etc/docker/certs.d/10.31.20.17:5000
   
   # Copy your certificate (replace 'your-cert.crt' with your actual cert filename)
   sudo cp /path/to/your-cert.crt /etc/docker/certs.d/10.31.20.17:5000/ca.crt
   ```

2. Alternatively, add the certificate to macOS Keychain:
   ```bash
   # Double-click the certificate file to add it to Keychain
   # Or use the command line:
   sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain /path/to/your-cert.crt
   ```

3. Restart Docker Desktop:
   - Click the Docker icon in the menu bar
   - Select "Restart"
   - Or quit and reopen Docker Desktop

### Step 2: Login to the Registry

You must authenticate before pushing or pulling images:

```bash
docker login 10.31.20.17:5000
```

When prompted, enter:
- **Username:** Your registry username
- **Password:** Your registry password

The credentials will be stored in `~/.docker/config.json` for future use.

**Verify login:**
```bash
# Check if you can access the registry catalog
curl -u username:password https://10.31.20.17:5000/v2/_catalog
```

## Building and Pushing Images

### Method 1: Using Docker Compose (Recommended)

This is the simplest method and handles both services automatically.

```bash
# Navigate to the project directory
cd /Users/kkirkland/Documents/GitHub/devicecheck

# Build all images
docker-compose build

# Push all images to the registry
docker-compose push
```

### Method 2: Build and Push Individual Services

If you only want to build/push specific services:

```bash
# Build and push only the web service
docker-compose build web
docker-compose push web

# Build and push only the worker service
docker-compose build worker
docker-compose push worker
```

### Method 3: Manual Docker Commands

For more control over the build process:

```bash
# Build and push web image
docker build -t 10.31.20.17:5000/devicecheck-web:latest -f Dockerfile .
docker push 10.31.20.17:5000/devicecheck-web:latest

# Build and push worker image
docker build -t 10.31.20.17:5000/devicecheck-worker:latest -f Dockerfile.worker .
docker push 10.31.20.17:5000/devicecheck-worker:latest
```

## Pulling and Running Images

### Pull Images from Registry

```bash
# Pull all images defined in docker-compose.yml
docker-compose pull

# Or pull individual services
docker-compose pull web
docker-compose pull worker
```

### Run the Application

```bash
# Start all services (pulls images if not present locally)
docker-compose up -d

# View logs
docker-compose logs -f

# Stop all services
docker-compose down
```

## Tagging and Versioning

### Using Version Tags

Instead of always using `latest`, you can tag images with versions:

```bash
# Build with a specific version tag
docker build -t 10.31.20.17:5000/devicecheck-web:v1.0.0 -f Dockerfile .
docker push 10.31.20.17:5000/devicecheck-web:v1.0.0

# Also tag as latest
docker tag 10.31.20.17:5000/devicecheck-web:v1.0.0 10.31.20.17:5000/devicecheck-web:latest
docker push 10.31.20.17:5000/devicecheck-web:latest
```

### Update docker-compose.yml for Specific Versions

Edit the image tags in `docker-compose.yml`:
```yaml
web:
  image: 10.31.20.17:5000/devicecheck-web:v1.0.0
  # ...
```

## Troubleshooting

### Error: "http: server gave HTTP response to HTTPS client"

**Solution:** You haven't configured the insecure registry. Follow the "One-Time Setup" section above.

### Error: "connection refused"

**Possible causes:**
- Registry server is not running
- Wrong IP address or port
- Firewall blocking the connection

**Check registry connectivity:**
```bash
curl http://10.31.20.17:5000/v2/_catalog
```

### Error: "unauthorized: authentication required"

If your registry requires authentication:
```bash
docker login 10.31.20.17:5000
# Enter username and password when prompted
```

### List Images in Registry

```bash
# List all repositories
curl http://10.31.20.17:5000/v2/_catalog

# List tags for a specific image
curl http://10.31.20.17:5000/v2/devicecheck-web/tags/list
curl http://10.31.20.17:5000/v2/devicecheck-worker/tags/list
```

### Clear Local Images

If you want to force a fresh pull from the registry:
```bash
# Remove local images
docker rmi 10.31.20.17:5000/devicecheck-web:latest
docker rmi 10.31.20.17:5000/devicecheck-worker:latest

# Pull fresh from registry
docker-compose pull
```

## Quick Reference

```bash
# Complete workflow from scratch
docker-compose build          # Build images locally
docker-compose push           # Push to registry
docker-compose pull           # Pull from registry (on any machine)
docker-compose up -d          # Run the application

# Update and redeploy
docker-compose build          # Rebuild after code changes
docker-compose push           # Push new version
docker-compose pull           # Pull on deployment server
docker-compose up -d          # Restart with new images
```

## Registry Information

- **Registry URL:** `10.31.20.17:5000`
- **Web Image:** `10.31.20.17:5000/devicecheck-web:latest`
- **Worker Image:** `10.31.20.17:5000/devicecheck-worker:latest`
- **Protocol:** HTTP (insecure registry)
