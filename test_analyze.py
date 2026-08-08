import sys
import json
import requests

SERVER_URL = "http://localhost:5001/analyze"

SAMPLE_HTML_DARK = """
<div class="cart-container">
  <h2>Shopping Cart</h2>
  <div class="urgent-banner">Hurry! Offer ends in 03:45 minutes!</div>
  <div class="price-breakdown">
    <p>Subtotal: $29.99</p>
    <p>Mandatory Handling Fee: $5.99</p>
    <label><input type="checkbox" id="protection-plan" checked> Add 1-Year Device Protection ($7.99)</label>
  </div>
  <button id="checkout-btn">Proceed to Checkout</button>
  <button id="decline-btn">No thanks, I prefer risking my purchase breaking</button>
</div>
"""

SAMPLE_HTML_HONEST = """
<div class="checkout-box">
  <h2>Your Order</h2>
  <p>Item: Wireless Keyboard ($45.00)</p>
  <p>Standard Shipping: Free</p>
  <button>Place Order</button>
</div>
"""

def run_test(label, html_content):
    print(f"\n==========================================")
    print(f"Running Test: {label}")
    print(f"==========================================")
    
    payload = {
        "url": "https://test-store.example.com/checkout",
        "html": html_content
    }
    
    try:
        response = requests.post(SERVER_URL, json=payload, timeout=10)
        print(f"HTTP Status: {response.status_code}")
        data = response.json()
        print(json.dumps(data, indent=2))
        return data
    except Exception as e:
        print(f"Request failed: {e}")
        return None

if __name__ == "__main__":
    run_test("Dark Pattern Sample (Urgency + Pre-checked + Hidden Fee + Confirmshaming)", SAMPLE_HTML_DARK)
    run_test("Honest Page Sample", SAMPLE_HTML_HONEST)
