/**
 * ═══════════════════════════════════════════════════════════════════
 * NEXIA OS — NOTIFICATIONS MODULE v1.0
 * Triggers: purchase confirmation, booking confirmation, ticket confirm
 * Uses existing EmailJS config (client-side) + SendGrid (server-side)
 * Include AFTER core/config.js, core/bridge.js
 * ═══════════════════════════════════════════════════════════════════
 */
'use strict';

const NexiaNotifications = (() => {

  // ── EmailJS public key (client-side sending) ──────────────────
  // Reads from NEXIA config or uses env
  const EMAILJS_PUBLIC_KEY  = 'YOUR_EMAILJS_PUBLIC_KEY';   // set in Firestore config or here
  const EMAILJS_SERVICE_ID  = 'YOUR_EMAILJS_SERVICE_ID';
  const EMAILJS_TEMPLATE_ID = 'YOUR_EMAILJS_TEMPLATE_ID';

  let _emailjsReady = false;

  // ── Init EmailJS if available ─────────────────────────────────
  function _initEmailJS() {
    if (typeof emailjs === 'undefined') {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js';
      s.onload = () => {
        emailjs.init(EMAILJS_PUBLIC_KEY);
        _emailjsReady = true;
      };
      document.head.appendChild(s);
    } else {
      emailjs.init(EMAILJS_PUBLIC_KEY);
      _emailjsReady = true;
    }
  }

  // ── Browser push notification ─────────────────────────────────
  async function pushNotification(title, body, options = {}) {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'denied') return;

    if (Notification.permission !== 'granted') {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') return;
    }

    const sw = await navigator.serviceWorker?.ready.catch(() => null);
    if (sw) {
      sw.showNotification(title, {
        body,
        icon:  options.icon  || '/viajante-pro/icon-192.png',
        badge: options.badge || '/viajante-pro/icon-192.png',
        tag:   options.tag   || 'nexia',
        data:  options.data  || {},
      });
    } else {
      new Notification(title, { body, icon: options.icon || '/viajante-pro/icon-192.png' });
    }
  }

  // ── Purchase confirmation ─────────────────────────────────────
  async function confirmPurchase({ email, name, productName, price, orderId, category }) {
    // 1. Browser push
    const pushTitles = {
      ticket: '🎟️ Ingresso Confirmado!',
      travel: '✈️ Reserva Confirmada!',
      module: '🔧 Módulo Ativado!',
    };
    await pushNotification(
      pushTitles[category] || '✅ Compra Confirmada!',
      `${productName} — R$ ${Number(price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      { tag: `order-${orderId}` }
    );

    // 2. Firestore notification record
    if (typeof NEXIA !== 'undefined' && NEXIA.db) {
      try {
        const tenantId = window._nexiaSession?.tenantId || 'GUEST';
        await NEXIA.db.collection('tenants').doc(tenantId)
          .collection('notifications').add({
            type:     category || 'purchase',
            title:    pushTitles[category] || '✅ Compra Confirmada',
            body:     `${productName} — Pedido #${orderId}`,
            read:     false,
            email,
            orderId,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          });
      } catch (e) {
        console.warn('[NexiaNotifications] Firestore write:', e.message);
      }
    }

    // 3. EmailJS (client-side backup)
    if (_emailjsReady && email) {
      emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
        to_email:    email,
        to_name:     name || email.split('@')[0],
        product:     productName,
        price:       `R$ ${Number(price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
        order_id:    orderId,
        category,
      }).catch(e => console.warn('[NexiaNotifications] EmailJS:', e));
    }
  }

  // ── Booking confirmation (Viajante Pro) ───────────────────────
  async function confirmBooking({ email, name, destination, dates, packageName, orderId }) {
    await pushNotification(
      `✈️ Viagem para ${destination} confirmada!`,
      `${packageName} · ${dates}`
    );
    return confirmPurchase({ email, name, productName: packageName, orderId, category: 'travel' });
  }

  // ── Event ticket confirmation (CES) ───────────────────────────
  async function confirmTicket({ email, name, eventName, date, packageName, orderId }) {
    await pushNotification(
      `🎟️ Ingresso para ${eventName}!`,
      `${packageName} · ${date}`
    );
    return confirmPurchase({ email, name, productName: packageName, orderId, category: 'ticket' });
  }

  // ── Request browser push permission (call on user gesture) ────
  async function requestPushPermission() {
    if (!('Notification' in window)) return false;
    const perm = await Notification.requestPermission();
    return perm === 'granted';
  }

  // Auto-init EmailJS
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _initEmailJS);
  } else {
    _initEmailJS();
  }

  return {
    confirmPurchase,
    confirmBooking,
    confirmTicket,
    pushNotification,
    requestPushPermission,
  };
})();

window.NexiaNotifications = NexiaNotifications;

if (typeof NEXIA !== 'undefined' && NEXIA.log) {
  NEXIA.log('NexiaNotifications module online v1.0', 'ok');
}
