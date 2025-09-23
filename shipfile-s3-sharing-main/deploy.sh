#!/bin/bash
echo "Deploying ShipFile to Vercel..."

# Add all changes
git add .

# Commit with timestamp
git commit -m "Deploy: $(date '+%Y-%m-%d %H:%M:%S') - PostgreSQL backend ready"

# Push to trigger Vercel deployment
git push origin main

echo "Deployment triggered. Check Vercel dashboard for status."