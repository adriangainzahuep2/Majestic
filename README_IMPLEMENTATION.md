# Majestic Health App - Implementation Documentation

## Table of Contents
1. [Google OAuth Setup](#google-oauth-setup)
2. [Core Functionality Fixes](#core-functionality-fixes)
3. [Data Uploads](#data-uploads)
4. [Backend API](#backend-api)
5. [Mobile API Integration](#mobile-api-integration)
6. [Spreadsheet Module](#spreadsheet-module)
7. [UI Tweaks](#ui-tweaks)
8. [Deployment](#deployment)

## Google OAuth Setup
- Implemented Google OAuth 2.0 for user authentication.
- Added a new `google-oauth.js` service to handle the OAuth flow.
- Updated the `authController.js` to handle the `/google` and `/google/callback` routes.

## Core Functionality Fixes
- **HDL Cholesterol Range:** Corrected the normal range for HDL cholesterol in `database/schema.js`.
- **Null/String Values:** Addressed `null` and string values for normal range min/max by ensuring proper type coercion.
- **Review Metric Suggestions:** Implemented a new `metricSuggestionsController.js` to handle unmatched metrics with confidence-based auto-mapping (≥95% confidence auto-map, ≤94% confidence manual review).
- **Synonym Matching:** Created a new `synonymService.js` to improve synonym matching accuracy.

## Data Uploads
- Implemented a new `ingestionService.js` to handle the classification and processing of all file types, including visual tests.

## Backend API
- Refactored the backend into a modular API with a single entry point (`api.js`).

## Mobile API Integration
- Added a new `/api/mobile` route to provide data to the mobile app.

## Spreadsheet Module
- Implemented a new `spreadsheetService.js` to handle the analysis of spreadsheet changes and rollbacks.

## UI Tweaks
- Added a new `/api/ui` route to provide data for the Apple Watch-like UI.
- The trends screen has been removed from the UI.

## Deployment
- Created a new `deploy_aws_complete.sh` script for automated deployment to AWS.
- The script uses S3, user data, EC2, ECS, RDS, and LightSail.
- Implemented a non-SSH method for testing the database connection.
