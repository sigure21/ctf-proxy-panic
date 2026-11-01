# Deployment

저장소 루트에서 CLI를 사용합니다.

```sh
node tools/ctf.mjs doctor
node tools/ctf.mjs up
node tools/ctf.mjs status
node tools/ctf.mjs verify
node tools/ctf.mjs down
```

`up`은 `.runtime/ctf.env`에 flag와 worker token을 자동 생성한 뒤 build, start, health wait를 수행합니다. 운영자가 secret을 소스나 compose 파일에 기록할 필요가 없습니다.

## 배포 점검

- publish 주소가 `127.0.0.1`인지
- worker가 `internal: true` backplane에만 연결되는지
- `privileged`, host network, host bind mount, Docker socket이 없는지
- root filesystem이 read-only인지
- non-root, `cap_drop: ALL`, `no-new-privileges`인지
- PID, CPU, memory, file-size limit과 healthcheck가 있는지
- 공식 solver와 negative regression이 통과하는지

행사 플랫폼으로 옮길 때도 실제 비밀정보나 host credential을 컨테이너에 넣지 마십시오. 인터넷에 직접 publish하지 말고 격리된 per-team runner 뒤에 배치하십시오.

## 종료와 재발급

```sh
node tools/ctf.mjs down
node tools/ctf.mjs reset
```

`reset`은 정확히 이 Compose 프로젝트만 제거하고 `.runtime/ctf.env`를 재발급합니다.

