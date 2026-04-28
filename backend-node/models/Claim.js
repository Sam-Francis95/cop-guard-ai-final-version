import mongoose from 'mongoose';

const claimSchema = new mongoose.Schema({
  claimId: { type: String, required: true, unique: true },
  workerId: { type: String, required: true },
  workerName: { type: String, required: true },
  workerEmail: { type: String, required: true },
  qrCode: { type: String, required: true },
  issueType: { type: String, required: true },
  description: { type: String, required: true },
  location: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true }
  },
  status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED', 'HOLD'], default: 'PENDING' },
  source: { type: String, enum: ['MANUAL', 'AI'], required: true },
  aiReason: { type: String },
  aiConfidence: { type: Number },
  duplicate: { type: Boolean, default: false }
}, { timestamps: true });

const Claim = mongoose.model('Claim', claimSchema);
export default Claim;
