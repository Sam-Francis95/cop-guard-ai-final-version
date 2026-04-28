import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import multer from 'multer';
import { MongoMemoryServer } from 'mongodb-memory-server';

import Worker from './models/Worker.js';
import Claim from './models/Claim.js';

const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Memory Storage for Base64 Conversion
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'image/png' || file.mimetype === 'image/jpeg') {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PNG and JPG are allowed.'));
    }
  }
});

// Database Connection & Server Bootstrap
mongoose.set('bufferCommands', false); // Fail fast, never buffer endlessly

async function bootstrap() {
  try {
    console.log('⏳ Attempting connection to native local MongoDB...');
    await mongoose.connect('mongodb://localhost:27017/copguardai_workers', {
      serverSelectionTimeoutMS: 2000 // Fails fast
    });
    console.log('✅ Connected natively to MongoDB');
  } catch (err) {
    console.log('⚠️ Local MongoDB unreachable! Bootstrapping fully functional In-Memory Cluster...');
    try {
      const mongoServer = await MongoMemoryServer.create();
      const mongoUri = mongoServer.getUri();
      await mongoose.connect(mongoUri);
      console.log('✅ Connected safely to In-Memory MongoDB Fallback. Ready for payloads!');
    } catch (fallbackErr) {
      console.error('❌ FATAL: Cannot launch memory server!', fallbackErr);
      process.exit(1);
    }
  }

  // Start Server only after DB validation
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Worker QR Claims Node Backend running on http://127.0.0.1:${PORT}`);
  });
}
bootstrap();

// ==========================================
// ROUTES
// ==========================================

// 1. Worker gets or creates profile + QR
app.post('/api/workers/:id/qr', express.json({limit: '10mb'}), async (req, res) => {
  try {
    const { qrCodeUrl } = req.body;
    let worker = await Worker.findOne({ phoneNumber: req.params.id });
    
    if (!worker) {
      worker = new Worker({
        phoneNumber: req.params.id,
        name: 'Worker',
        qrCodeUrl: qrCodeUrl,
        qrUpdatedAt: new Date()
      });
    } else {
      worker.qrCodeUrl = qrCodeUrl;
      worker.qrUpdatedAt = new Date();
    }

    await worker.save();
    
    res.json({
      success: true,
      qrCodeUrl: worker.qrCodeUrl
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 1b. Worker gets profile status
app.get('/api/workers/:id/qr', async (req, res) => {
  try {
    const worker = await Worker.findOne({ phoneNumber: req.params.id });
    
    if (!worker) {
      return res.status(200).json({
        success: true,
        qrCodeUrl: null,
        message: "Worker not found but payload bounded."
      });
    }
    
    res.json({
      success: true,
      qrCodeUrl: worker.qrCodeUrl || null
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

const recentSubmissions = new Map();

app.post('/api/claims', async (req, res) => {
  try {
    const { workerPhoneNumber, workerName, issueType, description, location, source } = req.body;

    if (!workerPhoneNumber) {
      return res.status(400).json({ success: false, error: 'Worker phone required for identity binding.' });
    }

    const worker = await Worker.findOne({ phoneNumber: workerPhoneNumber });
    if (!worker || !worker.qrCodeUrl) {
      return res.status(403).json({ success: false, error: 'QR upload is mandatory before filing claims.' });
    }

    // Duplicate Check
    const tenMinutesAgo = new Date(Date.now() - 10 * 60000);
    const existingRecent = await Claim.findOne({
      workerId: workerPhoneNumber,
      issueType: issueType || 'GENERAL',
      description,
      createdAt: { $gte: tenMinutesAgo }
    });

    const newClaim = new Claim({
      claimId: `CLM-${Date.now()}`,
      workerId: workerPhoneNumber,
      workerName: workerName || worker.name || 'Unknown',
      workerEmail: worker.email || 'no-email@copguard.ai',
      qrCode: worker.qrCodeUrl,
      issueType: issueType || 'GENERAL',
      description: description || 'No Description',
      location: {
        lat: location?.lat || 0,
        lng: location?.lng || 0
      },
      status: 'PENDING',
      source: source || 'MANUAL',
      duplicate: !!existingRecent
    });

    await newClaim.save();

    // Asynchronous AI Verification Engine execution natively
    setTimeout(async () => {
      try {
        // Rules-based engine (Production Deterministic AI Simulation)
        let aiDecision = 'APPROVED';
        let reasoning = 'Valid sequence and correct geospatial location structure without anomalies.';
        let confidence = 85 + Math.random() * 10;

        if (newClaim.duplicate) {
          aiDecision = 'REJECTED';
          reasoning = 'Velocity flagged: Claim matches an identically issued payload submitted recently.';
          confidence = 98;
        } else if (newClaim.issueType === 'TERRAIN' && newClaim.location.lat === 0) {
          aiDecision = 'REJECTED';
          reasoning = 'Terrain issue flagged but no logical geographic bounds detected from client.';
          confidence = 92;
        } else if (newClaim.description.length < 10 && newClaim.source === 'MANUAL') {
          aiDecision = 'REJECTED';
          reasoning = 'Description insufficient for deterministic extraction context.';
          confidence = 88;
        }

        await Claim.findByIdAndUpdate(newClaim._id, {
          status: aiDecision,
          aiReason: reasoning,
          aiConfidence: Math.round(confidence)
        });
        console.log(`[AI Engine] Verified ${newClaim.claimId} -> ${aiDecision}`);
      } catch (e) {
        console.error('[AI Engine] Failed verification trace:', e);
      }
    }, 1500);

    res.status(201).json({ success: true, claimId: newClaim.claimId, duplicate: !!existingRecent });
  } catch (error) {
    console.error('API /api/claims crashed', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 3. Admin gets claims
app.get('/api/claims', async (req, res) => {
  try {
    const { status, workerId } = req.query;
    const filter = {};
    if (status && status !== 'ALL') filter.status = status;
    if (workerId) filter.workerId = workerId;

    const claims = await Claim.find(filter).sort({ createdAt: -1 });
    res.status(200).json({ success: true, claims });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 4. Admin Universal Status Update
app.patch('/api/claims/:id', async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['APPROVED', 'REJECTED', 'HOLD', 'PAID', 'PENDING'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status strictly out of bounds.' });
    }

    const claim = await Claim.findById(req.params.id);
    if (!claim) return res.status(404).json({ success: false, error: 'Claim mapped node not found.' });

    claim.status = status;
    if (status === 'PAID') claim.paidAt = new Date();
    claim.updatedAt = new Date();

    await claim.save();
    res.status(200).json({ success: true, claim });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Admin Mark Default Payload Fallback (Optional Legacy Fallback)
app.patch('/api/admin/claims/:id/pay', async (req, res) => {
  try {
    const { adminId } = req.body;
    const claim = await Claim.findById(req.params.id);

    if (!claim) return res.status(404).json({ success: false, error: 'Claim mapped node not found' });
    if (claim.status === 'PAID') return res.status(400).json({ success: false, error: 'Already paid' });

    claim.status = 'PAID';
    claim.adminId = adminId || 'admin-system';
    claim.paidAt = new Date();
    claim.updatedAt = new Date();

    await claim.save();
    res.status(200).json({ success: true, claim });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
