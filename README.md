# StatePass — Setup & Run Guide

Welcome to **StatePass**, a deterministic, stateless password generator ecosystem. This repository contains the complete codebase for:

1. **`statepass-server`**: Node.js & PostgreSQL self-hosted Rest API for syncing user profiles.
2. **`statepass-website`**: Next.js (React) modern web application for generating passwords and managing profiles.
3. **`statepass-ext`**: Vanilla JavaScript Chrome extension featuring autofill and seamless popup synchronization.

---

## 🏗️ Architecture Overview

The system is designed with a **Zero-Knowledge** architecture. Neither the website nor the extension ever transmits or stores master passwords or generated passwords. They only synchronize profile parameters (like site domain, usernames, password lengths, and configurations) with the server.

---

## 🛠️ System Prerequisites

Ensure you have the following installed on your machine:
* **Node.js** (v18.0.0 or higher)
* **npm** (v9.0.0 or higher)
* **Docker & Docker Compose** (for running the backend + database)
* **Google Chrome** (or any Chromium-based browser)

---

## 🚀 Step-by-Step Setup

Follow the steps below in order to set up and run the entire ecosystem locally:

### 1. Start the Backend & Database (`statepass-server`)
The backend uses Docker Compose to run an Express server and a PostgreSQL database.

1. Navigate to the `statepass-server` directory:
   ```bash
   cd statepass-server
   ```
2. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```
3. Edit the `.env` file to customize passwords and secrets:
   * **`PORT`**: Set to `4000` (avoids colliding with the frontend).
   * **`DB_PASSWORD`**: Input a secure password for PostgreSQL database.
   * **`JWT_SECRET`**: Input a long random string (at least 32 characters).
   * **`ALLOWED_ORIGINS`**: Set to `http://localhost:3000` (allows the website to call the backend).

4. Spin up the containers:
   ```bash
   docker compose up -d
   ```
5. Verify that the backend is running and connected to the database by visiting:
   [http://localhost:4000/api/health](http://localhost:4000/api/health)
   
   Expected response:
   ```json
   {
     "status": "ok",
     "db": "connected"
   }
   ```

---

### 2. Run the Web App (`statepass-website`)
The website is a modern Next.js application that runs on port `3000` by default.

1. Navigate to the `statepass-website` directory:
   ```bash
   cd ../statepass-website
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```
4. Access the application in your browser at:
   [http://localhost:3000](http://localhost:3000)

*Note: The website features a built-in **Offline Mode** fallback. If the backend server on port 4000 is not reachable, profiles will automatically save locally inside the browser's `localStorage`.*

---

### 3. Install the Chrome Extension (`statepass-ext`)
The extension is built using pure Vanilla JS and has no build step.

1. Open Google Chrome and navigate to the Extensions page:
   * URL: `chrome://extensions/`
2. Enable **Developer mode** using the toggle switch in the top-right corner.
3. Click **Load unpacked** in the top-left corner.
4. Select the `src` folder located inside the `statepass-ext/` directory:
   * Path: `statepass-ext/src/`
5. The **StatePass** extension icon should now appear in your browser's toolbar.

---

## 🔄 How to Synchronize Profiles

Once all components are running:

1. **Website Registration**:
   * Open [http://localhost:3000](http://localhost:3000).
   * Click **Sign In / Sync** in the top right.
   * Switch to the **Register** tab and create an account.
   
2. **Extension Configuration & Login**:
   * Click the StatePass extension icon to open the popup.
   * Select the **Sync Server** tab.
   * Input the Server URL (`http://localhost:4000`), your email, and password.
   * Click **Login**.
   
3. **Synchronizing Profiles**:
   * Under the **Sync Server** tab in either the website or the extension, click **Two-Way Sync** (or push/pull) to sync saved profiles across all your devices seamlessly!
