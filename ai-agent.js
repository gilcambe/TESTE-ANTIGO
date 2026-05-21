/**
 * ═══════════════════════════════════════════════════════════════════
 * NEXIA OS — PAYMENT MODULE v1.0
 * Client-side payment flow: calls /.netlify/functions/checkout
 * Works for CES tickets, VP packages, and NEXIA modules
 * Include AFTER core/config.js and core/auth.js
 * ═══════════════════════════════════════════════════════════════════
 */
'use strict';

const NexiaPayment = (() => {

  const CHECKOUT_URL = '/.netlify/functions/checkout';

  /**
   * initiateCheckout(options)
   * options: {
   *   productId:   'ces_premium' | 'vp_premium' | ...  (catalog key)
   *   moduleName:  string  (legacy module path)
   *   price:       number  (BRL float, e.g. 297.00)
   *   tenantId:    string
   *   moduleId:    string  (legacy)
   *   onLoading:   () => void
   *   onSuccess:   (initPoint: string) => void
   *   onError:     (msg: string) => void
   * }
   */
  async function initiateCheckout(opts = {}) {
    const {
      productId, moduleName, price, tenantId, moduleId,
      onLoading, onSuccess, onError,
    } = opts;

    // Collect buyer info from auth session if available
    const session = (typeof NexiaAuth !== 'undefined' && NexiaAuth.getSession)
      ? NexiaAuth.getSession() : null;
    const buyerEmail = session?.email || opts.buyerEmail || null;
    const buyerName  = session?.name  || opts.buyerName  || null;

    if (typeof onLoading === 'function') onLoading();

    try {
      const res = await fetch(CHECKOUT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId,
          moduleName,
          price,
          tenantId,
          moduleId,
          buyerEmail,
          buyerName,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.init_point) {
        const msg = data.error || 'Erro ao iniciar pagamento. Tente novamente.';
        if (typeof onError === 'function') onError(msg);
        return null;
      }

      if (typeof onSuccess === 'function') onSuccess(data.init_point);

      // Default: redirect to MercadoPago
      window.location.href = data.init_point;
      return data;

    } catch (err) {
      const msg = 'Erro de conexão. Verifique sua internet e tente novamente.';
      if (typeof onError === 'function') onError(msg);
      console.error('[NexiaPayment]', err);
      return null;
    }
  }

  /**
   * handlePaymentReturn()
   * Call on pages that MP returns to (?payment=success|failure|pending).
   * Returns { status, ref } or null.
   */
  function handlePaymentReturn() {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('payment');   // success | failure | pending
    const ref    = params.get('external_reference') || '';
    if (!status) return null;

    if (typeof NEXIA !== 'undefined' && NEXIA.log) {
      NEXIA.log(`Payment return: ${status} (${ref})`, status === 'success' ? 'ok' : 'warn');
    }

    return { status, ref };
  }

  /**
   * renderPayButton(containerSelector, opts)
   * Injects a ready-to-use pay button into any container.
   * opts: { productId, label, className }
   */
  function renderPayButton(containerSelector, opts = {}) {
    const container = typeof containerSelector === 'string'
      ? document.querySelector(containerSelector)
      : containerSelector;
    if (!container) return;

    const label = opts.label || 'Comprar Agora';
    const cls   = opts.className || 'nexia-pay-btn';

    const btn = document.createElement('button');
    btn.className  = cls;
    btn.textContent = label;
    btn.type = 'button';

    btn.addEventListener('click', () => {
      btn.disabled = true;
      btn.textContent = 'Aguarde...';

      initiateCheckout({
        ...opts,
        onLoading: () => { btn.disabled = true; btn.textContent = 'Redirecionando...'; },
        onError:   (msg) => {
          btn.disabled = false;
          btn.textContent = label;
          alert(msg);
        },
      });
    });

    container.appendChild(btn);
    return btn;
  }

  return { initiateCheckout, handlePaymentReturn, renderPayButton };
})();

window.NexiaPayment = NexiaPayment;

if (typeof NEXIA !== 'undefined' && NEXIA.log) {
  NEXIA.log('NexiaPayment module online v1.0', 'ok');
}
