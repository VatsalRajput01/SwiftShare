import express from "express";
import multer from "multer";
import fs from "fs";
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import path from "path";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcrypt";
import archiver from "archiver";
import cron from "node-cron";
import cors from 'cors';
import 'dotenv/config';

// --- PATH SETUP ---
// Define __filename and __dirname for module compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// --- END PATH SETUP ---


// --- CONSTANTS ---
const SALT_ROUNDS = 10;
const PORT = process.env.PORT || 3000;
// Path to the JSON file storing file metadata
const DATA_FILE = path.join(__dirname, 'file_metadata.json');

// NOTE: Your specific R2 configuration keys
const R2_BUCKET_NAME = "swiftshare-files";
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;

// Configure S3 Client for Cloudflare R2
const R2_ENDPOINT = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

const s3 = new S3Client({
    // R2 uses the 'auto' region for its endpoint configuration
    region: "auto",
    endpoint: R2_ENDPOINT,
    credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
});

const app = express();

// Ensure 'uploads' directory exists (Used for temporary operations, if any)
const UPLOADS_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR);
}

// --- MIDDLEWARE SETUP ---
app.use(cors()); // Enable CORS for all routes
app.use(express.static(path.join(__dirname, "public")));
// Set body limits high for large file uploads
app.use(express.json({ limit: '1024mb' }));
app.use(express.urlencoded({ limit: '1024mb', extended: true }));
// --- END MIDDLEWARE ---


// --- DATA PERSISTENCE (JSON FILE) ---
let fileCodes = {}; // Object to hold all file metadata (code as key)

// Loads file metadata from the disk (JSON file)
function loadCodes() {
    try {
        const data = fs.readFileSync(DATA_FILE, 'utf8');
        fileCodes = data ? JSON.parse(data) : {};
        console.log(`✅ Loaded ${Object.keys(fileCodes).length} file codes from disk.`);
    } catch (error) {
        if (error.code === 'ENOENT') console.log('File metadata not found. Starting fresh.');
        else console.error('Error loading file codes:', error);
        fileCodes = {};
    }
}

// Saves current file metadata to the disk (JSON file)
function saveCodes() {
    try {
        const data = JSON.stringify(fileCodes, null, 2);
        fs.writeFileSync(DATA_FILE, data, 'utf8');
    } catch (error) {
        console.error('Error saving file codes:', error);
    }
}
loadCodes();
// --- END DATA PERSISTENCE ---


// R2 INTEGRATION: Helper function to delete a file from R2
async function deleteFileFromR2(key) {
    const command = new DeleteObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
    });
    try {
        await s3.send(command);
        console.log(`🗑️ Deleted R2 object successfully: ${key}`);
    } catch (e) {
        // Log the error but proceed, especially if the file is already gone (Not Found)
        console.error(`Error deleting R2 file ${key}:`, e.name);
    }
}

// --- CLEANUP LOGIC: Expired Files ---
async function cleanupExpiredFiles() {
    const now = Date.now();
    let cleanedUpCount = 0;
    const codesToDelete = []; // List of codes to be removed

    console.log(`\n🧹 Running cleanup job at ${new Date().toLocaleTimeString()}...`);

    // 1. Find all expired codes
    for (const code in fileCodes) {
        const fileInfo = fileCodes[code];
        if (fileInfo.expiryTime < now) {
            codesToDelete.push(code);
        }
    }

    // 2. Delete from R2 and remove metadata
    for (const code of codesToDelete) {
        const fileInfo = fileCodes[code];
        // Check for the R2Key (the actual file identifier)
        if (fileInfo && fileInfo.R2Key) {
            await deleteFileFromR2(fileInfo.R2Key); // Delete from R2
            delete fileCodes[code]; // Remove metadata
            cleanedUpCount++;
        } else if (fileInfo && !fileInfo.R2Key) {
            // Remove old/corrupt records that don't have an R2Key
            delete fileCodes[code];
            cleanedUpCount++;
        }
    }

    if (cleanedUpCount > 0) {
        saveCodes(); // Save updated metadata
        console.log(`✅ Cleanup finished. ${cleanedUpCount} expired file(s) removed.`);
    } else {
        console.log(`✅ Cleanup finished. No expired files found.`);
    }
}
// --- END CLEANUP LOGIC ---

// --- ORPHAN FILE CLEANUP ---
// This function is commented out as file cleanup is managed by R2Key and expiry time.
/*
function cleanupOrphanFiles() {
    console.log("\n🧩 [SKIPPED] Orphan file check (Not needed for R2).");
}
*/
// --- END ORPHAN CLEANUP ---


// R2 INTEGRATION: Configure Multer to use memory storage
const uploadStorage = multer.memoryStorage();

const upload = multer({
    storage: uploadStorage,
    limits: {
        // Limit file size to 500 MB
        fileSize: 1024 * 1024 * 500
    }
}).array('file'); // 'file' is the name of the form field for files


// --- R2 UPLOAD HELPER ---
// Uploads the file buffer to R2
async function uploadBufferToR2(buffer, key, contentType) {
    const command = new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: contentType || 'application/octet-stream', // Default Content-Type
    });
    await s3.send(command);
}
// --- END R2 UPLOAD HELPER ---

// --- Helper function to ZIP files in memory ---
function zipFilesToBuffer(files) {
    return new Promise((resolve, reject) => {
        const archive = archiver('zip', {
            // Set compression level lower than 9 to reduce RAM/CPU load
            zlib: { level: 6 }
        });
        const buffers = []; // Stores the zip file chunks in memory

        archive.on('data', (data) => buffers.push(data));
        archive.on('end', () => resolve(Buffer.concat(buffers))); // Concatenate chunks into a single buffer
        archive.on('error', (err) => reject(err));

        // Append each file (currently in memory buffer) to the archive
        files.forEach(file => {
            archive.append(file.buffer, { name: file.originalname });
        });

        archive.finalize();
    });
}


// 1️⃣ UPLOAD ROUTE (Handles file receiving and R2 storage)
app.post("/upload", (req, res) => {
    upload(req, res, async (err) => {
        // Handle file size limit error
        if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({ message: "File too large. Each file must be under 500 MBs." });
        }
        if (err) {
            console.error('General upload error:', err);
            return res.status(500).json({ message: "An unknown error occurred during file upload." });
        }

        const uploadedFiles = req.files;
        if (!uploadedFiles || uploadedFiles.length === 0) {
            return res.status(400).json({ message: "No files selected. Please choose a file to upload." });
        }

        const { expiryHours, password, maxDownloads } = req.body;
        const fileCode = Math.random().toString(36).substring(2, 10).toUpperCase();
        const hashedPassword = password ? await bcrypt.hash(password, SALT_ROUNDS) : null;
        const maxDownloadsCount = Number(maxDownloads) || 1;
        const expiryTime = Date.now() + (Number(expiryHours) || 1) * 60 * 60 * 1000;

        let fileBuffer; // Holds the file content in memory
        let originalName;
        let contentType;
        let isZip = false;
        // Unique name for the file in R2
        let R2Key = `${fileCode}-${uuidv4()}`;

        if (uploadedFiles.length === 1) {
            // --- SINGLE FILE LOGIC ---
            fileBuffer = uploadedFiles[0].buffer; // Get buffer from memory storage
            originalName = uploadedFiles[0].originalname;
            contentType = uploadedFiles[0].mimetype;
            R2Key += path.extname(originalName);

        } else {
            // --- MULTIPLE FILE LOGIC (ZIP) ---
            isZip = true;
            originalName = 'SwiftShareFiles.zip'; // Name for the generated ZIP file
            contentType = 'application/zip';
            R2Key += '.zip'; // Append .zip extension to R2 Key

            try {
                // ZIP the files in memory to a single buffer
                fileBuffer = await zipFilesToBuffer(uploadedFiles);
            } catch (e) {
                console.error('In-memory ZIP creation failed:', e);
                return res.status(500).json({ message: "Failed to create a ZIP file." });
            }
        }

        // --- Upload to R2 ---
        try {
            await uploadBufferToR2(fileBuffer, R2Key, contentType);
            console.log(`✅ R2 upload successful for code: ${fileCode}, Key: ${R2Key}`);
        } catch (e) {
            console.error('R2 Upload Failed:', e);
            return res.status(500).json({ message: "File upload failed due to cloud storage error." });
        }

        // --- Save Metadata ---
        fileCodes[fileCode] = {
            R2Key: R2Key, // Store the unique R2 object key
            originalName,
            isZip,
            expiryTime,
            password: hashedPassword,
            maxDownloads: maxDownloadsCount,
            currentDownloads: 0
        };

        saveCodes();

        res.json({
            message: "File uploaded successfully 🎉",
            downloadCode: fileCode,
            expiresIn: `${expiryHours || 1} hours`,
        });
    });
});


// --- R2 DOWNLOAD HELPER ---
// Retrieves a readable stream for a file from R2
async function getFileStreamFromR2(key) {
    const command = new GetObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
    });
    // Receive the response from R2
    const response = await s3.send(command);
    // The Body is a readable stream, return it
    return response.Body;
}


// 2️⃣ DOWNLOAD CHECK ROUTE (Verifies code and password before starting download)
app.post("/download", async (req, res) => {
    const { code, password } = req.body;
    const fileInfo = fileCodes[code];

    // Check 1: Code validity (and R2Key presence)
    if (!fileInfo || !fileInfo.R2Key) {
        return res.status(404).json({
            success: false,
            message: "Invalid code or Max Download Exceeded & File Expired. Please check the 8-character code."
        });
    }

    const now = Date.now();

    // Check 2: File has expired
    if (now > fileInfo.expiryTime) {
        await deleteFileFromR2(fileInfo.R2Key); // Delete from R2
        delete fileCodes[code];
        saveCodes();
        return res.status(410).json({ success: false, message: "This file has expired and is no longer available." });
    }

    // Check 3: Download limit reached
    if (fileInfo.currentDownloads >= fileInfo.maxDownloads) {
        await deleteFileFromR2(fileInfo.R2Key); // Delete from R2
        delete fileCodes[code];
        saveCodes();
        return res.status(410).json({ success: false, message: "Download limit reached. This file is no longer available." });
    }

    // Check 4: Password required but not provided
    if (fileInfo.password && !password) {
        return res.status(401).json({
            success: false,
            message: "This file is password protected. Please enter the password.",
            requiresPassword: true
        });
    }

    // Check 5: Incorrect password
    if (fileInfo.password && password) {
        const isMatch = await bcrypt.compare(password, fileInfo.password);
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: "Incorrect password. Please try again.",
                requiresPassword: true
            });
        }
    }

    // Check 6: All good. Return file details to initiate stream download.
    const fileExtension = !fileInfo.isZip ? path.extname(fileInfo.originalName) : "";
    const downloadFileName = fileInfo.isZip ? "SwiftShareFiles.zip" : `SwiftShareFile${fileExtension}`;

    return res.status(200).json({
        success: true,
        fileName: downloadFileName,
        message: "File verified. Starting download."
    });
});


// 3️⃣ DOWNLOAD STREAM ROUTE (Streams the file directly from R2 to the client)
app.get("/download-stream", async (req, res) => {
    const code = req.query.code;
    const fileInfo = fileCodes[code];

    // Check for metadata existence
    if (!fileInfo || !fileInfo.R2Key) {
        return res.status(404).send("File not found or already deleted.");
    }

    // Determine the filename for the client
    const fileExtension = fileInfo && !fileInfo.isZip ? path.extname(fileInfo.originalName) : '';
    const downloadFileName = fileInfo.isZip ? `SwiftShareFiles.zip` : `SwiftShareFile${fileExtension}`;

    try {
        // Stream the file from R2
        const fileStream = await getFileStreamFromR2(fileInfo.R2Key);

        // Tell the browser this is an attachment/download
        res.setHeader('Content-Disposition', `attachment; filename="${downloadFileName}"`);
        res.setHeader('Content-Type', fileInfo.isZip ? 'application/zip' : 'application/octet-stream');

        // Pipe the R2 stream directly to the response
        fileStream.pipe(res);

        // --- Update download count on stream completion ---
        fileStream.on('end', async () => {
            // Check if the file was deleted during the download process (e.g., by the cleanup job)
            if (!fileCodes[code]) return;

            const updatedInfo = fileCodes[code];
            updatedInfo.currentDownloads++;
            const shouldDelete = updatedInfo.currentDownloads >= updatedInfo.maxDownloads;

            if (shouldDelete) {
                await deleteFileFromR2(updatedInfo.R2Key);
                delete fileCodes[code];
                console.log(`R2 file deleted successfully after max downloads: ${updatedInfo.R2Key}`);
            }

            saveCodes(); // Save the new download count
        });

        // Handle errors during streaming
        fileStream.on('error', (err) => {
            console.error('R2 Stream error:', err);
            if (!res.headersSent) res.status(500).send("Error streaming file.");
        });

    } catch (e) {
        console.error('R2 Get File Error:', e);
        // Handle case where R2 object is not found or other GetObject errors
        return res.status(404).send("File not found in cloud storage.");
    }
});

// --- PING ROUTE ---
app.get("/ping", (req, res) => {
    res.status(200).send("OK");
});


// Home route: Serves the main application page
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});


// --- SERVER SHUTDOWN CLEANUP ---
// Ensures metadata is saved before the process exits
function exitHandler() {
    console.log("Saving final metadata before exit...");
    saveCodes();
    process.exit();
}
process.on('SIGINT', exitHandler); // Ctrl+C
process.on('SIGTERM', exitHandler); // Kill command
// --- END SERVER SHUTDOWN CLEANUP ---


// --- SCHEDULE CRON JOB ---
// Load codes initially (already done above, but good practice to ensure)
loadCodes();
// Schedule the cleanup function to run every 10 minutes (*/10)
cron.schedule('*/10 * * * *', () => {
    cleanupExpiredFiles();
});
console.log('🗓️ Scheduled cleanup job to run every 10 minutes.');
// --- END SCHEDULE CRON JOB ---


app.listen(PORT, () => console.log(`✅ SwiftShare running on port ${PORT}`));