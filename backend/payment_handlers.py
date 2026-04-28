"""
Razorpay Payment Gateway Integration for CopGuardAI
Handles secure payment processing for approved insurance claims
"""

import os
import razorpay
import hmac
import hashlib
from datetime import datetime
from db import get_db_connection

# Initialize Razorpay Client (TEST MODE)
RAZORPAY_KEY_ID = os.getenv('RAZORPAY_KEY_ID', 'rzp_test_NbZpvdZHScmhqU')
RAZORPAY_KEY_SECRET = os.getenv('RAZORPAY_KEY_SECRET', 'XGtZAGJhBdXVAVv6P5Cv9y1l')

client = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))


def get_claim_by_id(claim_id):
    """Fetch claim from database"""
    try:
        conn = get_db_connection()
        claim = conn.execute(
            "SELECT * FROM claims WHERE claim_id = ?",
            (claim_id,)
        ).fetchone()
        conn.close()
        return dict(claim) if claim else None
    except Exception as e:
        print(f"[DB-ERROR] Failed to fetch claim {claim_id}: {str(e)}", flush=True)
        return None


def create_razorpay_order(claim_id):
    """
    Create a Razorpay payment order for a claim.
    
    Args:
        claim_id: CLM-xxxxx format
    
    Returns:
        {
            'success': bool,
            'order_id': str (if success),
            'amount': int,
            'currency': 'INR',
            'key': str,
            'message': str
        }
    """
    try:
        # Fetch claim from database
        claim = get_claim_by_id(claim_id)
        if not claim:
            return {
                'success': False,
                'message': f'Claim {claim_id} not found'
            }
        
        # Ensure claim is APPROVED
        if claim.get('status') != 'APPROVED':
            return {
                'success': False,
                'message': f'Only APPROVED claims can be paid. Current status: {claim.get("status")}'
            }
        
        # Calculate payout amount: risk_score * 100 (INR)
        # Example: risk_score 75 = ₹7500 payout | Min ₹5000
        payout_amount = max(claim.get('risk_score', 50) * 100, 5000)
        
        print(f"[RAZORPAY] Creating order for {claim_id} | Amount: ₹{payout_amount/100}", flush=True)
        
        # Create Razorpay order
        order = client.order.create({
            'amount': int(payout_amount * 100),  # Convert to paise
            'currency': 'INR',
            'payment_capture': 1,
            'notes': {
                'claim_id': claim_id,
                'worker_id': claim.get('worker_id'),
                'worker_name': claim.get('worker_name')
            }
        })
        
        order_id = order['id']
        
        # Update claim with order details
        _update_claim_order_initiated(claim_id, order_id, payout_amount)
        
        print(f"[RAZORPAY] Order created: {order_id} | Claim: {claim_id}", flush=True)
        
        return {
            'success': True,
            'order_id': order_id,
            'amount': int(payout_amount),
            'currency': 'INR',
            'key': RAZORPAY_KEY_ID,
            'message': 'Order created successfully'
        }
    
    except Exception as e:
        print(f"[RAZORPAY-ERROR] Order creation failed: {str(e)}", flush=True)
        import traceback
        traceback.print_exc()
        return {
            'success': False,
            'message': f'Order creation failed: {str(e)}'
        }


def verify_razorpay_payment(payment_id, order_id, signature, claim_id):
    """
    Verify Razorpay payment signature using HMAC-SHA256.
    
    Args:
        payment_id: razorpay_payment_id
        order_id: razorpay_order_id
        signature: razorpay_signature (hex string)
        claim_id: CLM-xxxxx
    
    Returns:
        {
            'success': bool,
            'message': str,
            'claim_id': str (if success),
            'payment_id': str (if success)
        }
    """
    try:
        # Verify signature using HMAC-SHA256
        message = f"{order_id}|{payment_id}"
        computed_signature = hmac.new(
            RAZORPAY_KEY_SECRET.encode(),
            message.encode(),
            hashlib.sha256
        ).hexdigest()
        
        if computed_signature != signature:
            print(f"[RAZORPAY] Signature mismatch for {claim_id}", flush=True)
            _update_claim_payment_failed(claim_id, payment_id)
            return {
                'success': False,
                'message': 'Payment verification failed: Invalid signature'
            }
        
        print(f"[RAZORPAY] Signature verified for {claim_id}", flush=True)
        
        # Fetch payment details from Razorpay to confirm
        payment = client.payment.fetch(payment_id)
        
        if payment['status'] != 'captured':
            print(f"[RAZORPAY] Payment not captured: {payment['status']}", flush=True)
            _update_claim_payment_failed(claim_id, payment_id)
            return {
                'success': False,
                'message': f"Payment status: {payment['status']}"
            }
        
        # Mark claim as PAID
        _update_claim_payment_successful(claim_id, payment_id)
        
        print(f"[RAZORPAY] Payment successful | {claim_id} | Payment ID: {payment_id}", flush=True)
        
        return {
            'success': True,
            'message': 'Payment verified and claim settled',
            'claim_id': claim_id,
            'payment_id': payment_id
        }
    
    except Exception as e:
        print(f"[RAZORPAY-VERIFY-ERROR] {str(e)}", flush=True)
        import traceback
        traceback.print_exc()
        return {
            'success': False,
            'message': f'Verification error: {str(e)}'
        }


def _update_claim_order_initiated(claim_id, order_id, payout_amount):
    """Update claim with order_id and set payment_status to INITIATED"""
    try:
        conn = get_db_connection()
        conn.execute("""
            UPDATE claims 
            SET order_id = ?, payout_amount = ?, payment_status = 'INITIATED', updated_at = ?
            WHERE claim_id = ?
        """, (order_id, int(payout_amount), datetime.utcnow().isoformat(), claim_id))
        conn.commit()
        conn.close()
        print(f"[DB] Claim {claim_id} updated with order {order_id}", flush=True)
    except Exception as e:
        print(f"[DB-ERROR] Failed to update claim payment initiated: {str(e)}", flush=True)


def _update_claim_payment_successful(claim_id, payment_id):
    """Mark claim as PAID"""
    try:
        conn = get_db_connection()
        conn.execute("""
            UPDATE claims 
            SET payment_id = ?, payment_status = 'PAID', updated_at = ?
            WHERE claim_id = ?
        """, (payment_id, datetime.utcnow().isoformat(), claim_id))
        conn.commit()
        conn.close()
        print(f"[DB] Claim {claim_id} marked as PAID", flush=True)
    except Exception as e:
        print(f"[DB-ERROR] Failed to update claim payment successful: {str(e)}", flush=True)


def _update_claim_payment_failed(claim_id, payment_id):
    """Mark payment as FAILED"""
    try:
        conn = get_db_connection()
        conn.execute("""
            UPDATE claims 
            SET payment_id = ?, payment_status = 'FAILED', updated_at = ?
            WHERE claim_id = ?
        """, (payment_id, datetime.utcnow().isoformat(), claim_id))
        conn.commit()
        conn.close()
        print(f"[DB] Claim {claim_id} payment marked as FAILED", flush=True)
    except Exception as e:
        print(f"[DB-ERROR] Failed to update claim payment failed: {str(e)}", flush=True)
