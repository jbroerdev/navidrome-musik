// Check the container's own web server; upstream outages do not restart the UI.
try {
  const response = await fetch(`http://127.0.0.1:${process.env.PORT || 4173}/`, {
    signal: AbortSignal.timeout(3000),
  });
  if (!response.ok) process.exitCode = 1;
  await response.body?.cancel();
} catch {
  process.exitCode = 1;
}
