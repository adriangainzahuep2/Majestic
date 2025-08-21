# Majestic - AI-Driven Health App MVP

## Overview
Majestic is an AI-driven health application that provides personalized health insights and plans by processing diverse health data, including lab reports and visual studies, through unified AI analysis. It tracks user health across 13 body systems and presents comprehensive data via an intuitive dashboard. The application aims to empower users with actionable health knowledge and is designed for immediate deployment.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Backend Architecture
The backend is built with **Node.js/Express**, featuring a **modular RESTful API** design. It utilizes a **PostgreSQL database** (migrated to **Drizzle ORM** for type-safe operations) for data persistence and a **Bull/Redis queue system** for asynchronous tasks. Authentication is handled via **JWT** with **Google OAuth** integration.

### Frontend Architecture
The frontend is a **vanilla JavaScript Single Page Application** using **Bootstrap 5** for responsive UI and **Plotly.js** for data visualization. It employs client-side routing and token-based authentication. The design adopts a modern Apple Health + Calm aesthetic with a "Rising Sun over Horizon" icon and warm orange/gold gradients.

### AI Integration
Core AI functionality is powered by **OpenAI GPT-4o**. This includes processing PDFs and images for lab report and visual study data extraction, health metric parsing across 13 body systems, and generating personalized daily health plans. AI outputs are structured in JSON for consistent data handling.

### Key Components

#### Health Systems Framework
The application categorizes health data into 13 distinct body systems (e.g., Cardiovascular, Nervous, Digestive, Genetics & Biological Age), each with key metrics, recency thresholds, and automatic metric categorization.

#### Core Services
-   **Authentication Service**: Handles Google OAuth, JWT, and user profile management.
-   **Health Systems Service**: Manages dashboard logic, metric-to-system mapping, and key metric identification.
-   **OpenAI Service**: Orchestrates AI processing, including OCR, daily plan generation, and error handling.
-   **Queue Service**: Manages background jobs for file processing and scheduled tasks.

#### Database Schema
The PostgreSQL database includes tables for users, health systems, metrics, uploads, AI outputs, and imaging studies, with a modernized schema using Drizzle ORM.

#### Data Flow
The system supports a unified ingestion pipeline for various file types. Files are uploaded, queued for background AI processing (GPT-4o), and then stored in the database. Data is then used for dashboard generation with system-specific analysis and personalized daily plan generation.

## External Dependencies

### Required Services
-   **OpenAI API**: For AI processing.
-   **Google OAuth**: For user authentication.
-   **PostgreSQL**: Primary database.
-   **Redis**: Optional queue backend (with local fallback).

### Node.js Dependencies
-   **Express**: Web framework.
-   **Bull**: Job queue management.
-   **OpenAI**: AI API client.
-   **pg**: PostgreSQL database driver.
-   **google-auth-library**: Google OAuth integration.
-   **Multer**: File upload handling.
-   **jsonwebtoken**: JWT token authentication.
-   **cors**: Cross-origin request handling.