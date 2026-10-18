document.querySelector('#run').addEventListener('click', async () => {
  const result = document.querySelector('#result');
  const started = performance.now();
  try {
    const response = await fetch('/api/probes', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${document.querySelector('#token').value}` },
      body: JSON.stringify({ id: crypto.randomUUID(), delayMs: 10000, mode: 'NORMAL' }),
    });
    const body = await response.json();
    result.textContent = JSON.stringify({ status: response.status, responseReceivedAt: new Date().toISOString(), elapsedMs: Math.round(performance.now() - started), body }, null, 2);
  } catch { result.textContent = 'Anropet misslyckades. Kontrollera databasen innan ett nytt försök.'; }
});
