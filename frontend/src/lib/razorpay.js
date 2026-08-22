const CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

let loader = null;

/**
 * Loads Razorpay Checkout on demand.
 *
 * Deliberately not a <script> tag in index.html: most visits never reach
 * payment, and Razorpay's bundle is not small. Memoised so opening checkout
 * twice does not inject the script twice.
 */
export const loadRazorpay = () => {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  if (loader) return loader;

  loader = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${CHECKOUT_SRC}"]`);
    const script = existing || document.createElement('script');

    script.onload = () => resolve(window.Razorpay);
    script.onerror = () => {
      // Allow a retry: an ad blocker or a flaky network shouldn't wedge
      // checkout for the rest of the session.
      loader = null;
      script.remove();
      reject(new Error('Could not load the payment gateway. Check your connection or ad blocker.'));
    };

    if (!existing) {
      script.src = CHECKOUT_SRC;
      script.async = true;
      document.body.appendChild(script);
    }
  });

  return loader;
};

/**
 * Opens Checkout and resolves with the fields Razorpay hands back.
 *
 * Rejects with `{ dismissed: true }` when the customer closes the widget, so
 * the caller can tell "changed their mind" (seats stay held, offer a retry)
 * apart from "payment failed".
 */
export const openCheckout = async (session, { prefill = {} } = {}) => {
  const Razorpay = await loadRazorpay();

  return new Promise((resolve, reject) => {
    let settled = false;

    const rzp = new Razorpay({
      key: session.keyId,
      // Razorpay works in paise. Sending rupees would undercharge by 100x.
      amount: session.amountInPaise,
      currency: session.currency || 'INR',
      order_id: session.orderId,
      name: 'CineWave',
      description: session.description,
      image: '/favicon.svg',
      prefill: {
        name: prefill.name || session.customer?.name || '',
        email: prefill.email || session.customer?.email || '',
        contact: prefill.contact || ''
      },
      notes: { bookingRef: session.bookingRef },
      theme: { color: '#FF3B5C' },
      handler: (response) => {
        settled = true;
        resolve(response);
      },
      modal: {
        ondismiss: () => {
          if (settled) return;
          settled = true;
          reject(Object.assign(new Error('Payment cancelled.'), { dismissed: true }));
        },
        escape: true,
        confirm_close: true
      }
    });

    rzp.on('payment.failed', (response) => {
      if (settled) return;
      settled = true;
      reject(new Error(response?.error?.description || 'Your payment was declined.'));
    });

    rzp.open();
  });
};
