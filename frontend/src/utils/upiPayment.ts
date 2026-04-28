/**
 * UPI Payment Utilities for CopGuardAI
 * Handles UPI deep linking and device detection
 */

export interface UPIPaymentConfig {
  upiId: string;
  appName: string;
  amount: number;
  transactionRef: string;
  description: string;
}

/**
 * Detect if device is mobile or desktop
 */
export const isMobileDevice = (): boolean => {
  const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
  
  // Check for common mobile patterns
  const mobileRegex = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i;
  return mobileRegex.test(userAgent.toLowerCase());
};

/**
 * Detect installed UPI apps (approximate - better detection requires platform APIs)
 */
export const getAvailableUPIApps = (): string[] => {
  const apps: string[] = [];
  
  // These would be the apps that typically handle UPI links
  // In a real scenario, you'd use platform-specific APIs to check installed apps
  if (isMobileDevice()) {
    apps.push('googlepay'); // Google Pay is most common
    apps.push('phonepe');   // PhonePe
    apps.push('paytm');     // Paytm
  }
  
  return apps;
};

/**
 * Generate UPI payment link in standard format
 * Format: upi://pay?pa=UPI_ID&pn=NAME&am=AMOUNT&cu=CURRENCY&tn=TRANSACTION_NOTE
 */
export const generateUPILink = (config: UPIPaymentConfig): string => {
  const params = new URLSearchParams({
    pa: config.upiId,           // Payee UPI ID
    pn: config.appName,         // Payee name
    am: config.amount.toString(),
    cu: 'INR',                  // Currency
    tn: config.description      // Transaction note
  });
  
  return `upi://pay?${params.toString()}`;
};

/**
 * Trigger UPI payment on mobile
 */
export const triggerUPIPayment = (upiLink: string): void => {
  // Show loading state briefly
  const loadingMessage = 'Opening payment...';
  console.log(loadingMessage);
  
  // Redirect to UPI link
  window.location.href = upiLink;
};

/**
 * Encode UPI link for QR code
 */
export const encodeUPIForQR = (config: UPIPaymentConfig): string => {
  return generateUPILink(config);
};

/**
 * Format currency amount to INR display format
 */
export const formatINR = (amount: number): string => {
  return `₹${amount.toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  })}`;
};

/**
 * Get payment method recommendation based on device
 */
export const getRecommendedPaymentMethod = (): 'upi' | 'razorpay' => {
  return isMobileDevice() ? 'upi' : 'razorpay';
};

/**
 * Detect if we're on a desktop browser (used for QR code display)
 */
export const isDesktopBrowser = (): boolean => {
  return !isMobileDevice();
};
