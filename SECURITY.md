# Security Boundary

Proxy Panic is intentionally vulnerable software for a local CTF.

## Safe operating assumptions

- Run it only on a machine you control.
- Keep the published address on `127.0.0.1`.
- Do not add host mounts, the Docker socket, host networking, extra capabilities, or privileged mode.
- Do not place real credentials in `FLAG`, `WORKER_TOKEN`, the image, or either container.
- Destroy the instance with `node tools/ctf.mjs down` when finished.
- Use an isolated per-team runner if adapting the challenge to an event platform.

The intended exploit executes a shell command as the unprivileged `node` user inside the worker container. The worker has a read-only root filesystem, a small tmpfs, no Linux capabilities, no external network, no host resources, and resource limits. These controls reduce impact but do not make Internet exposure safe.

## Reporting repository issues

Open a GitHub issue for defects in the educational model, documentation, isolation configuration, or unintended solutions. Do not include real credentials or third-party target data.

For vulnerabilities in a real product, follow that vendor's disclosure policy. This repository is not an intake channel for Collabora Online or Nextcloud security reports.

