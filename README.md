# SwiftShare

SwiftShare is a fast, privacy-focused file-sharing web app. Upload single or multiple files without creating an account, get an 8-character code, and share it with anyone. Files are automatically deleted once they expire or reach their download limit.

**Live Demo:** https://swift-share.netlify.app

---

## Features

* **No Account Required:** Upload and download files instantly without sign-up or tracking.
* **8-Character Access Code:** Every upload generates a unique code to retrieve the file.
* **Multiple File Support:** Uploading multiple files automatically bundles them into a single ZIP file.
* **Password Protection:** Optionally lock files with a password (hashed using `bcrypt`).
* **Expiry & Download Limits:** Set files to expire after 1, 6, 12, or 24 hours, or after 1 to 5 downloads.
* **Automatic Cleanup:** Expired and fully downloaded files are permanently removed from cloud storage.
* **Clean Interface:** Drag-and-drop uploads, upload progress bar, and light/dark mode support.

---

## How It Works

1. **Upload:** Files (up to 500 MB each) are received in server memory via Multer and uploaded directly to Cloudflare R2—nothing is stored on the server disk.
2. **Download:** Entering a valid code (and password, if set) streams the file directly from Cloudflare R2 to the user's browser.
3. **Auto-Delete:** A background job runs every 10 minutes to delete expired files from R2, and files are also deleted immediately after hitting their max download limit.

---

## Tech Stack

* **Backend:** Node.js, Express, Multer, Cloudflare R2 (`@aws-sdk/client-s3`)
* **Utilities:** `bcrypt` (password hashing), `archiver` (in-memory ZIP), `node-cron` (scheduled cleanup)
* **Frontend:** HTML5, CSS3, Vanilla JavaScript, Toastify.js

---

## Running Locally

### 1. Clone and Install

```bash
git clone [https://github.com/VatsalRajput01/SwiftShare.git](https://github.com/VatsalRajput01/SwiftShare.git)
cd SwiftShare
npm install