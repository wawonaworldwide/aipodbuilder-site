export function setupOrderPage() {
  const root = document.querySelector<HTMLElement>('[data-order-page]');
  if (!root) return;
  const query = new URLSearchParams(location.search);
  let session = query.get('session_id') || '';
  if (session) {
    history.replaceState(null, '', location.pathname);
    if (/^cs_test_[A-Za-z0-9_]{6,200}$/.test(session))
      try {
        sessionStorage.setItem('aipb-test-order', session);
      } catch {
        /* Browser storage can be disabled. */
      }
  } else
    try {
      session = sessionStorage.getItem('aipb-test-order') || '';
    } catch {
      /* Keep the recovery link available. */
    }
  const status = root.querySelector<HTMLElement>('[data-order-status]')!;
  const heading = root.querySelector<HTMLElement>('[data-order-heading]')!;
  const retry = root.querySelector<HTMLButtonElement>('[data-order-retry]')!;
  const download = root.querySelector<HTMLButtonElement>('[data-download]')!;
  let downloadUrl = '';
  let checks = 0;
  let busy = false;
  const poll = async () => {
    if (busy) return;
    busy = true;
    retry.hidden = true;
    checks++;
    try {
      const response = await fetch(
        '/api/order-status?session_id=' + encodeURIComponent(session),
        { cache: 'no-store', signal: AbortSignal.timeout(15000) },
      );
      const result = await response.json();
      if (result.state === 'ready' && typeof result.downloadUrl === 'string') {
        const url = new URL(result.downloadUrl, location.origin);
        if (
          url.origin !== location.origin &&
          !(
            location.hostname === 'localhost' &&
            url.origin === 'http://localhost:8787'
          )
        )
          throw Error('Unexpected download.');
        if (!/^\/download\/[A-Za-z0-9_-]{43}$/.test(url.pathname))
          throw Error('Unexpected download.');
        downloadUrl = url.href;
        heading.textContent = 'You own it now. Small win!';
        status.textContent = 'Your download is ready.';
        root.querySelector<HTMLElement>('[data-product-name]')!.textContent =
          result.product;
        root.querySelector<HTMLElement>('[data-masked-email]')!.textContent =
          result.maskedEmail ? 'Order email: ' + result.maskedEmail : '';
        root.querySelector<HTMLElement>('[data-order-ready]')!.hidden = false;
        return;
      }
      if (result.state === 'not_paid') {
        heading.textContent = 'Let’s check your order.';
        status.textContent =
          result.message ||
          'We could not confirm a paid order. Return to the app page or request a fresh link.';
        return;
      }
      status.textContent =
        result.state === 'processing'
          ? 'Your payment is still processing. Your download will appear once it is paid.'
          : 'We are checking your payment. This may take a moment.';
    } catch {
      status.textContent =
        'We could not check your order yet. Please try again.';
    } finally {
      busy = false;
    }
    if (checks < 15) window.setTimeout(() => void poll(), 2000);
    else retry.hidden = false;
  };
  retry.addEventListener('click', () => {
    checks = 0;
    void poll();
  });
  download.addEventListener('click', async () => {
    download.disabled = true;
    try {
      const response = await fetch(downloadUrl, { cache: 'no-store' });
      if (!response.ok) {
        status.textContent =
          'That download is not available. Use the fresh-link form below.';
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const filename = /filename="([a-zA-Z0-9.-]+\.zip)"/.exec(
        response.headers.get('Content-Disposition') || '',
      )?.[1];
      link.download = filename || 'your-app.zip';
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      status.textContent =
        'Your download has started. Open the ZIP when it finishes.';
    } catch {
      status.textContent = 'The download could not connect. Please try again.';
    } finally {
      download.disabled = false;
    }
  });
  const form = root.querySelector<HTMLFormElement>('[data-owner-form]')!;
  const choice = form.querySelector<HTMLInputElement>('input')!;
  const submit = form.querySelector<HTMLButtonElement>('button')!;
  choice.addEventListener('change', () => {
    submit.disabled = !choice.checked;
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!choice.checked) return;
    submit.disabled = true;
    const message = form.querySelector<HTMLElement>('[role=status]')!;
    try {
      const response = await fetch('/api/order-updates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: session, app_updates: true }),
      });
      const result = await response.json();
      message.textContent = result.message || 'Please try again.';
      if (response.ok) choice.disabled = true;
      else submit.disabled = false;
    } catch {
      message.textContent = 'Please try saving your choice again.';
      submit.disabled = false;
    }
  });
  if (/^cs_test_[A-Za-z0-9_]{6,200}$/.test(session)) void poll();
}
