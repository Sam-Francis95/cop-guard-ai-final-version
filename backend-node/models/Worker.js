import mongoose from 'mongoose';

const workerSchema = new mongoose.Schema({
  phoneNumber: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  email: { type: String },
  qrCodeUrl: { type: String },
  qrUpdatedAt: { type: Date },
  createdAt: { type: Date, default: Date.now }
});

const Worker = mongoose.model('Worker', workerSchema);
export default Worker;
