# Proxy Panic

**Proxy Panic**은 raw request-target과 canonical route의 불일치를 cold-start shell sink까지 연결하는 독립 실행형 Web/RCE CTF입니다. 실제 제품 코드나 취약 패키지를 포함하지 않는 교육용 축소 모델입니다.

- 난이도: DreamHack Silver 후반 ~ Gold 초입
- 예상 시간: 45~90분
- 흐름: source map 발견 → raw/canonical path 차이 → backend-down 조건 → cold-start command injection → diagnostic trace 회수
- 기본 주소: `http://127.0.0.1:18083`
- 실행 환경: Windows, macOS, Linux + Docker Compose v2 + Node.js 22

> 이 저장소는 의도적으로 취약합니다. localhost 밖에 공개하거나 실제 시스템을 대상으로 payload를 재사용하지 마십시오.

## 1분 실행

별도 npm 패키지 설치는 필요하지 않습니다.

```sh
git clone https://github.com/sigure21/ctf-proxy-panic.git
cd ctf-proxy-panic
node tools/ctf.mjs doctor
node tools/ctf.mjs up
```

브라우저에서 `http://127.0.0.1:18083`을 엽니다. 첫 실행 시 `.runtime/ctf.env`에 로컬 flag와 worker token이 자동 생성됩니다. 이 파일은 Git에서 제외됩니다.

문제를 모두 확인한 뒤 운영자 검증을 실행할 수 있습니다.

```sh
node tools/ctf.mjs verify
node tools/ctf.mjs down
```

PowerShell, Command Prompt, bash, zsh에서 명령이 동일합니다.

## CLI

| 명령 | 동작 |
|---|---|
| `node tools/ctf.mjs up` | 비밀값 생성, 이미지 build, 서비스 시작, health 대기 |
| `node tools/ctf.mjs verify` | 서비스 보장, negative regression과 공식 solver 실행 |
| `node tools/ctf.mjs status` | Compose 상태와 HTTP health 표시 |
| `node tools/ctf.mjs flags` | 현재 로컬 인스턴스의 organizer flag 표시 |
| `node tools/ctf.mjs logs [service]` | 최근 로그 표시 |
| `node tools/ctf.mjs down` | 컨테이너와 네트워크 종료 |
| `node tools/ctf.mjs reset` | 종료, 비밀값 재발급, 새 인스턴스 시작 |
| `node tools/ctf.mjs doctor` | Node/Docker/Compose 및 격리 설정 진단 |

포트를 변경하려면 첫 실행 또는 `reset` 시 `PROXY_PANIC_PORT`를 지정합니다.

```powershell
$env:PROXY_PANIC_PORT = "28083"
node tools/ctf.mjs reset
```

```sh
PROXY_PANIC_PORT=28083 node tools/ctf.mjs reset
```

## 참가자와 운영자 문서

- 참가자 공개 지문: [`handout/README.md`](handout/README.md)
- 단계별 힌트: [`organizer/HINTS.md`](organizer/HINTS.md)
- 전체 풀이: [`organizer/WRITEUP.md`](organizer/WRITEUP.md)
- 배포 점검: [`organizer/DEPLOY.md`](organizer/DEPLOY.md)
- 비의도 풀이 점검: [`organizer/UNINTENDED.md`](organizer/UNINTENDED.md)
- 안전 경계: [`SECURITY.md`](SECURITY.md)

## 구조

```text
src/gateway.mjs          public UI, canonical router
src/worker.mjs           isolated vulnerable cold-start worker
solver/solve.mjs         reference solver
tests/challenge.mjs      live regression and intended exploit test
tests/static.test.mjs    dependency-free static safety tests
tools/ctf.mjs            cross-platform lifecycle CLI
compose.yaml             localhost-only hardened deployment
```

공개 gateway에는 flag와 shell sink가 없습니다. shell command substitution은 외부망이 없는 worker 컨테이너에서만 발생합니다. host mount, Docker socket, privileged mode, host network는 사용하지 않습니다.

## 배경 근거

이 문제는 다음 공개 자료에 기술된 취약점의 근본 원리를 새 코드로 모델링합니다.

- [GHSA-g3vx-3m76-fghh](https://github.com/CollaboraOnline/online/security/advisories/GHSA-g3vx-3m76-fghh)
- [CVE-2026-110447 — NVD](https://nvd.nist.gov/vuln/detail/CVE-2026-110447)
- [공개 공격 관찰 이슈 #354](https://github.com/CollaboraOnline/richdocumentscode/issues/354)

실제 제품의 경로, 함수 또는 payload 호환성을 주장하지 않습니다.

## 라이선스

[MIT](LICENSE)

