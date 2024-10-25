# URL Shortener Worker

A lightweight URL shortening service implemented as a Cloudflare Worker. This application allows users to shorten long URLs, track accesses, and verify users using Cloudflare's Turnstile.

## Prerequisites

- [Cloudflare account](https://www.cloudflare.com/)
- [Cloudflare Workers](https://workers.cloudflare.com/) enabled in your account.
- Basic understanding of Cloudflare Workers and environment variables.

## Setup Guide

### 1. Create a Cloudflare D1 Database

- Log in to your Cloudflare dashboard.
- Navigate to the **D1** section and create a new database.
- Once the database is created, click on it to open its dashboard.

### 2. Execute the Schema

- In the D1 dashboard, go to the **SQL Editor**.
- Run the following SQL schema to set up the `urls` table:

```sql
CREATE TABLE urls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    short_code TEXT UNIQUE NOT NULL,
    original_url TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    access_count INTEGER DEFAULT 0,
    expires_at TIMESTAMP
);
```

### 3. Set Environment Variables

- In the Worker settings, add the following environment variables:
  - `TURNSTILE_SITE_KEY`: Your Cloudflare Turnstile Site Key. To obtain this:
    - Go to the [Cloudflare Dashboard](https://dash.cloudflare.com).
    - Navigate to **Turnstile** under the **Security** section.
    - Follow the instructions to create a new Turnstile application and get the Site Key.
  - `TURNSTILE_SECRET_KEY`: Your Cloudflare Turnstile Secret Key. This can be found alongside your Site Key in the Turnstile settings.
  - `UC`: Bind your D1 database to your Worker with the identifier, usually `UC`. This will allow the Worker to execute SQL queries on your D1 database.

### 4. Copy the Worker Script

- Replace the default code in your new Worker with the provided script below.

### 5. Deploy Your Worker

- After copying the script and setting up the environment variables, deploy your Worker.
