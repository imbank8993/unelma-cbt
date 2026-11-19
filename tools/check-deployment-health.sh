#!/usr/bin/env sh
set -eu

attempt=0
while [ "$attempt" -lt 36 ]; do
  ready=true
  for service in unelma-cbt-latex unelma-cbt-scoring unelma-cbt-api unelma-cbt-background unelma-cbt-web; do
    state=$(docker inspect --format '{{.State.Status}}' "$service")
    health=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}' "$service")
    if [ "$state" != running ] || [ "$health" = unhealthy ] || [ "$health" = missing ]; then
      echo "Deployment gagal: $service state=$state health=$health"
      exit 1
    fi
    if [ "$health" != healthy ]; then ready=false; fi
  done
  if [ "$ready" = true ]; then
    docker exec unelma-cbt-web node -e '
      (async () => {
        const base = process.env.NEST_API_URL;
        if (!base) throw new Error("URL API internal tidak tersedia");
        const response = await fetch(base + "/health", { signal: AbortSignal.timeout(10000) });
        const health = await response.json();
        if (!response.ok || !health.ok) throw new Error("API, database, atau skoring belum siap");
        console.log("Koneksi web ke API, database, dan skoring terverifikasi.");
      })().catch(error => { console.error(error.message); process.exitCode = 1; });'
    echo 'Seluruh layanan UNELMA CBT healthy.'
    exit 0
  fi
  attempt=$((attempt + 1))
  sleep 5
done

echo 'Deployment gagal: layanan belum healthy dalam 180 detik.'
exit 1
