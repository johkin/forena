Backend-service för en färdig CI-testad OCI-image. Releasen genererar en Dockerfile
med endast `FROM <VCR-referens>@sha256:<digest>` för Vercel Services kompatibilitet.
Inga RUN/COPY-steg tillåts; image-ID:t i deployoutput kontrolleras mot CI-artefakten.
