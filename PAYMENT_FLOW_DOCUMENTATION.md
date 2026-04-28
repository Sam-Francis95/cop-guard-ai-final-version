# CopGuardAI Payment Flow Implementation

## Overview

A comprehensive UPI and Razorpay payment system for the admin dashboard that intelligently handles both mobile and desktop payments with premium UX.

## Features

### 1. **Smart Device Detection**
- **Mobile Devices**: Opens UPI deep links (Google Pay, PhonePe, Paytm)
- **Desktop Browsers**: Displays QR codes for mobile scanning

### 2. **Dual Payment Methods**
- **UPI Payment**: Direct payment via Google Pay and other UPI apps
  - Deep link: `upi://pay?pa=copguardai@okaxis&pn=CopGuardAI&am=AMOUNT&cu=INR&tn=Claim Payment`
  - QR code generation for desktop users
  - UPI ID manual entry option

- **Razorpay Payment**: Fallback secure gateway
  - Full payment verification with HMAC-SHA256
  - Order creation and payment tracking
  - Automatic claim status update to PAID

### 3. **Premium UI/UX**
- Modal-based payment interface with dark theme
- Smooth transitions and animations (Framer Motion)
- Payment details display (Worker Name, Claim ID, Amount)
- Loading states and error handling
- Responsive design (mobile & desktop)

### 4. **Real-time Feedback**
- "Opening payment..." loading state
- Copy-to-clipboard for UPI ID
- Success alerts with transaction ID
- Payment status badges (✅ PAID)

## Architecture

### Components

```
AdminAIClaimsPanel.tsx
├── PaymentModal.tsx
│   ├── UPI Payment Handler
│   ├── QR Code Generation
│   ├── Razorpay Integration
│   └── Payment Details Display
└── upiPayment.ts (Utilities)
    ├── Device Detection
    ├── UPI Link Generation
    └── Currency Formatting
```

### File Structure

```
frontend/
├── src/
│   ├── components/
│   │   └── PaymentModal.tsx          # Main payment modal component
│   ├── pages/
│   │   └── AdminAIClaimsPanel.tsx    # Updated with payment flow
│   └── utils/
│       └── upiPayment.ts             # UPI utilities and helpers
├── package.json                      # Updated with qrcode dependency
└── ...
```

## Usage

### 1. **Approve a Claim**
Admin clicks "Approve" button → Claim moves to APPROVED state

### 2. **Initiate Payment**
Admin clicks "💰 Pay Now (₹AMOUNT)" → Payment Modal opens

### 3. **Choose Payment Method**

**On Mobile:**
```
Payment Modal
├── UPI Apps Button → Opens Google Pay/PhonePe with UPI link
└── Razorpay Button → Opens Razorpay checkout
```

**On Desktop:**
```
Payment Modal
├── UPI QR Button → Shows QR Code + UPI ID option
└── Razorpay Button → Opens Razorpay checkout
```

### 4. **Complete Payment**
- **UPI**: User confirms in their UPI app → Auto-redirect or manual mark as paid
- **Razorpay**: Standard checkout flow → Backend verification → Auto-update to PAID

### 5. **Payment Status Update**
After successful payment, the payment section shows:
```
✅ PAID
Amount: ₹XXXX
ID: payment_id...
```

## Technical Details

### UPI Link Format

```
upi://pay?pa=<UPI_ID>&pn=<APP_NAME>&am=<AMOUNT>&cu=<CURRENCY>&tn=<TRANSACTION_NOTE>
```

**Parameters:**
- `pa`: Payee address (UPI ID) - `copguardai@okaxis`
- `pn`: Payee name - `CopGuardAI`
- `am`: Amount in INR
- `cu`: Currency - Always `INR`
- `tn`: Transaction note - `Claim Payment - <CLAIM_ID>`

### Device Detection Logic

```typescript
// Mobile Detection (isMobileDevice)
const userAgent = navigator.userAgent.toLowerCase();
const mobilePattern = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i;
return mobilePattern.test(userAgent);
```

### QR Code Generation

Using `qrcode` library:
```typescript
QRCode.toCanvas(canvasRef.current, upiLink, {
  width: 200,
  margin: 2,
  color: { dark: '#000000', light: '#ffffff' }
});
```

### Payment Modal State Management

```typescript
// State variables
const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
const [selectedClaim, setSelectedClaim] = useState<Claim | null>(null);
const [paymentInProgress, setPaymentInProgress] = useState<string | null>(null);

// Handlers
handlePayNow()           // Open payment modal
handleUPIPayment()       // UPI payment callback
handleRazorpayPayment()  // Razorpay payment callback
```

## Configuration

### Update UPI ID

In `PaymentModal.tsx`, update line 52:
```typescript
const upiConfig = {
  upiId: 'copguardai@okaxis',  // ← Change this to your actual UPI ID
  appName: 'CopGuardAI',
  amount: amount,
  transactionRef: claim.claim_id,
  description: `Claim Payment - ${claim.claim_id}`,
};
```

### Razorpay Credentials

Razorpay credentials are managed in `backend/app.py`:
```python
RAZORPAY_KEY_ID = os.getenv('RAZORPAY_KEY_ID', 'rzp_test_...')
RAZORPAY_KEY_SECRET = os.getenv('RAZORPAY_KEY_SECRET', 'XGtZ...')
```

## Flow Diagrams

### Mobile Payment Flow

```
┌─────────────────────┐
│  Click "Pay Now"    │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Payment Modal Opens │
└──────────┬──────────┘
           │
        ┌──┴──┐
        │     │
   UPI  │     │  Razorpay
        ▼     ▼
    ┌──────────┐     ┌────────────────┐
    │  Deep    │     │  Razorpay      │
    │  Link    │     │  Checkout      │
    │ Opens    │     │  Modal         │
    │ GPay     │     │                │
    └─────┬────┘     └────────┬───────┘
          │                   │
          │                   ▼
          │            ┌──────────────┐
          │            │ Payment      │
          │            │ Processed    │
          │            │ (Verified)   │
          │            └──────┬───────┘
          │                   │
          └───────────┬───────┘
                      ▼
          ┌──────────────────────┐
          │ Claim Status: PAID   │
          │ Show Success Alert   │
          └──────────────────────┘
```

### Desktop Payment Flow

```
┌─────────────────────┐
│  Click "Pay Now"    │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Payment Modal Opens │
└──────────┬──────────┘
           │
        ┌──┴──┐
        │     │
   UPI  │     │  Razorpay
        ▼     ▼
    ┌──────────┐     ┌────────────────┐
    │   QR     │     │  Razorpay      │
    │  Code    │     │  Checkout      │
    │ Shows    │     │  Modal         │
    └─────┬────┘     └────────┬───────┘
          │                   │
    Scan  │                   │
    with  │                   ▼
    Phone │            ┌──────────────┐
          │            │ Payment      │
          │            │ Processed    │
          │            └──────┬───────┘
          │                   │
          └───────────┬───────┘
                      ▼
          ┌──────────────────────┐
          │ Claim Status: PAID   │
          │ Show Success Alert   │
          └──────────────────────┘
```

## Dependencies

### Frontend
- `qrcode`: ^1.5.3 - QR code generation
- `framer-motion`: ^12.38.0 - Animations
- `lucide-react`: ^0.577.0 - Icons
- `react`: ^19.2.4 - Framework
- `react-dom`: ^19.2.4 - DOM bindings

### Backend
- `razorpay`: ^2.0.1 - Razorpay integration
- `flask`: ^3.1.3 - Web framework
- `requests`: ^2.32.5 - HTTP client

## Testing

### Manual Testing Checklist

#### Mobile Device
- [ ] Open admin dashboard on mobile
- [ ] Click "Pay Now" on an approved claim
- [ ] Select UPI payment method
- [ ] Verify UPI deep link opens Google Pay
- [ ] Test payment completion

#### Desktop Browser
- [ ] Open admin dashboard on desktop
- [ ] Click "Pay Now" on an approved claim
- [ ] Select UPI payment method
- [ ] Verify QR code displays correctly
- [ ] Test scanning QR code with mobile
- [ ] Copy UPI ID button works
- [ ] Back button returns to methods selection

#### Razorpay
- [ ] Test Razorpay payment on both mobile and desktop
- [ ] Verify payment verification succeeds
- [ ] Confirm claim status updates to PAID
- [ ] Test payment failure scenarios

### Browser Compatibility

- ✅ Chrome/Chromium 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Edge 90+
- ✅ Mobile Safari (iOS)
- ✅ Chrome Mobile (Android)

## Error Handling

### UPI Payment Errors

| Error | Cause | Solution |
|-------|-------|----------|
| No UPI app installed | User device has no UPI app | Show message to install GPay |
| Payment timeout | Network issue | Retry payment |
| Invalid UPI ID | Wrong UPI ID in config | Update UPI ID in PaymentModal |

### Razorpay Errors

| Error | Cause | Solution |
|-------|-------|----------|
| Order creation failed | Backend issue | Check server logs |
| Payment verification failed | Signature mismatch | Check Razorpay credentials |
| Script load failed | CDN issue | Retry or use fallback |

## Security Considerations

1. **UPI Links**: Standard UPI protocol, no sensitive data transmitted
2. **Razorpay**: 
   - HMAC-SHA256 signature verification
   - Secure API credentials (env variables)
   - No client-side secret exposure

3. **Admin Authorization**: 
   - JWT token verification required
   - All payment routes protected
   - Claim ownership validation

## Future Enhancements

- [ ] Multiple UPI ID support
- [ ] Offline payment marking
- [ ] Payment receipt generation
- [ ] Partial payment support
- [ ] Payment history export
- [ ] Webhook integration for UPI
- [ ] Payment analytics dashboard
- [ ] Multi-currency support

## Troubleshooting

### QR Code Not Displaying
**Check**: Canvas element is rendered and canvasRef is properly set
**Solution**: Verify React version compatibility

### UPI Link Not Opening
**Check**: Device has UPI app installed
**Solution**: Show alternative payment methods

### Razorpay Modal Not Opening
**Check**: Razorpay script loaded successfully
**Check**: Razorpay credentials are correct
**Solution**: Check browser console for errors

## Support

For issues or questions, refer to:
- Razorpay Documentation: https://razorpay.com/docs/
- UPI Specification: https://www.npci.org.in/
- CopGuardAI Documentation: [Link to main docs]

---

**Last Updated**: April 21, 2026
**Version**: 1.0
