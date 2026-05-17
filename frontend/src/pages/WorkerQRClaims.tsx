import React, { useState, useEffect } from 'react';
import { Upload, AlertCircle, CheckCircle, Smartphone, Info } from 'lucide-react';
import { motion } from 'framer-motion';

export default function WorkerQRClaims() {
  const [workerName, setWorkerName] = useState('');
  const [qrFile, setQrFile] = useState<File | null>(null);
  const [qrPreviewUrl, setQrPreviewUrl] = useState<string | null>(null);
  const [existingQrUrl, setExistingQrUrl] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<'IDLE' | 'UPLOADING' | 'SUCCESS' | 'ERROR'>('IDLE');
  const [uploadError, setUploadError] = useState('');

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      const user = JSON.parse(userStr);
      setWorkerName(user.name || '');
      if (user.phone) {
        const VITE_API_URL = import.meta.env.VITE_NODE_API_URL || "http://localhost:5001";
        const workerId = user.phone;
        
        fetch(`${VITE_API_URL}/api/workers/${workerId}/qr`)
          .then(async res => {
            if (!res.ok) throw new Error("API failed");
            const data = await res.json();
            setExistingQrUrl(data.qrCodeUrl || null);
          })
          .catch(err => console.error(err));
      }
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (!['image/png', 'image/jpeg'].includes(file.type)) {
        setUploadError('Only PNG and JPG files are accepted.');
        setUploadStatus('ERROR');
        return;
      }
      if (file.size > 2 * 1024 * 1024) {
        setUploadError('File size must be strictly under 2MB.');
        setUploadStatus('ERROR');
        return;
      }
      setQrFile(file);
      setQrPreviewUrl(URL.createObjectURL(file));
      setUploadError('');
      setUploadStatus('IDLE');
    }
  };

  const handleUploadQR = async () => {
    if (!qrFile) return;
    setUploadStatus('UPLOADING');
    try {
      const userStr = localStorage.getItem('user');
      if (!userStr) throw new Error("Worker identity not found in local session.");
      const user = JSON.parse(userStr);

      const renderBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = error => reject(error);
      });
      const base64Data = await renderBase64(qrFile);

      const VITE_API_URL = import.meta.env.VITE_NODE_API_URL || "http://localhost:5001";
      const workerId = user.phone;
      const qrCodeUrl = base64Data;

      const res = await fetch(`${VITE_API_URL}/api/workers/${workerId}/qr`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qrCodeUrl })
      });
      
      if (!res.ok) throw new Error("API failed");
      
      setExistingQrUrl(qrCodeUrl);
      setQrPreviewUrl(null);
      setQrFile(null);
      setUploadStatus('SUCCESS');
    } catch (err: any) {
      setUploadError(err.message);
      setUploadStatus('ERROR');
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pt-4 text-gray-100 pb-16">
      <div className="flex items-center gap-3 mb-6">
        <Smartphone className="w-8 h-8 text-blue-400" />
        <div>
          <h2 className="text-2xl font-bold text-white">QR Identity Hub</h2>
          <p className="text-sm text-gray-400">Manage your persistent UPI QR payload</p>
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 shadow-xl w-full md:w-2/3 mx-auto">
        <h3 className="text-lg font-bold text-white mb-4 border-b border-gray-800 pb-2">Permanent QR Identity</h3>

        {existingQrUrl && !qrPreviewUrl ? (
          <div className="space-y-4">
            <div className="bg-green-950/30 border border-green-900 p-4 rounded-lg flex gap-3 text-sm text-green-400">
              <CheckCircle className="w-5 h-5 flex-shrink-0" />
              <p>Your QR identity is securely anchored to your phone number. All new claims will automatically proxy payouts here.</p>
            </div>
            <div className="flex justify-center p-4 bg-gray-950 rounded-lg shadow-inner">
              <img src={existingQrUrl} alt="Active QR" className="h-48 object-contain rounded border border-gray-800" />
            </div>
            <div className="text-center pt-2">
              <button
                onClick={() => { setQrPreviewUrl(""); setQrFile(null); }}
                className="bg-gray-800 hover:bg-gray-700 px-6 py-2 rounded font-semibold transition"
              >
                Replace QR
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-blue-950/30 border border-blue-900 p-4 rounded-lg flex gap-3 text-sm text-blue-400 mb-6">
              <Info className="w-5 h-5 flex-shrink-0" />
              <p>Upload your UPI/Payment QR code here. It will be permanently bound to your current session.</p>
            </div>

            <div className="border-2 border-dashed border-gray-700 rounded-lg p-6 text-center hover:border-blue-500 transition cursor-pointer relative bg-gray-800/50">
              <input
                type="file"
                accept="image/png, image/jpeg"
                onChange={handleFileChange}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              {!qrPreviewUrl ? (
                <div className="pointer-events-none">
                  <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                  <p className="text-gray-300 font-semibold mb-1">Click to Upload QR</p>
                  <p className="text-xs text-gray-500">Only PNG/JPG up to 2MB allowed.</p>
                </div>
              ) : (
                <div className="pointer-events-none flex flex-col items-center">
                  <img src={qrPreviewUrl} alt="Preview" className="h-40 object-contain rounded shadow mb-3" />
                  <span className="text-sm font-semibold text-blue-400">Tap to browse different image</span>
                </div>
              )}
            </div>

            {uploadError && (
              <div className="bg-red-950/20 border border-red-900 p-3 rounded flex gap-2 text-red-500 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <p>{uploadError}</p>
              </div>
            )}

            {uploadStatus === 'SUCCESS' && (
              <div className="bg-green-950/20 border border-green-900 p-3 rounded flex justify-center text-green-500 text-sm">
                <CheckCircle className="w-4 h-4 mr-2" />
                QR anchored securely.
              </div>
            )}

            <button
              onClick={handleUploadQR}
              disabled={!qrFile || uploadStatus === 'UPLOADING'}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-lg font-bold flex justify-center items-center gap-2 mt-4 transition-colors disabled:opacity-50"
            >
              {uploadStatus === 'UPLOADING' ? 'Anchoring...' : 'Save QR Payload'}
            </button>
            {existingQrUrl && (
              <button
                onClick={() => { setQrPreviewUrl(null); setQrFile(null); }}
                className="w-full bg-transparent border border-gray-700 hover:bg-gray-800 text-gray-300 p-3 rounded-lg font-bold flex justify-center items-center mt-2 transition-colors"
              >
                Cancel Replace
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
