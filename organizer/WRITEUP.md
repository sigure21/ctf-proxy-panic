# Proxy Panic — Organizer Write-up

## 핵심

HTTP 라우터는 percent-decoding 후 `..`를 제거해 다음 요청을 정상 프록시 경로로 보냅니다.

```text
/xPAYLOADx/%2e%2e/apps/builtin-code/proxy.php
                    ↓ canonicalize
/apps/builtin-code/proxy.php
```

반면 cold-start 코드는 canonical path가 아니라 marker 앞의 **raw prefix**를 뽑아 shell command의 큰따옴표 안에 삽입합니다. 큰따옴표는 shell command substitution을 막지 않으므로 `$(...)`가 실행됩니다.

## 관찰

1. `/assets/office.js` 끝에 `sourceMappingURL=office.js.map`이 있습니다.
2. source map에는 raw prefix와 `shell_exec`의 조합이 보입니다.
3. 정상 status 요청은 backend가 down이고 bootstrap을 시도했다는 `503`을 돌려줍니다.
4. 응답의 `diagnostic` URL은 해당 시도의 bootstrap trace를 보여줍니다.

## 의도 payload

공백은 `${IFS}`로 대체합니다.

```text
/x$(printenv${IFS}FLAG)x/%2e%2e/apps/builtin-code/proxy.php?status=1
```

shell에서 `printenv FLAG`의 출력이 raw mount prefix에 치환되고, legacy bootstrap이 그 문자열을 trace에 기록합니다. 첫 응답의 `diagnostic` 경로를 GET하면 flag를 얻습니다. 기준 구현은 `solver/solve.mjs`입니다.

## 실제 사례와의 관계

GHSA-g3vx-3m76-fghh는 built-in CODE server가 실행 중이지 않을 때 `proxy.php` 요청으로 OS command가 실행될 수 있음을 명시합니다. 공개 이슈 #354에는 traversal, `$()`, `${IFS}`를 사용한 실제 공격 요청이 기록되어 있습니다. 이 CTF는 그 신뢰 경계와 cold-start 조건을 새 코드로 축소한 것이며 실제 제품의 경로·함수·payload 호환성을 주장하지 않습니다.

## 수정

- raw URL 조각을 shell command에 연결하지 않습니다.
- shell이 필요하면 문자열 command 대신 고정 executable과 인자 배열을 사용합니다.
- 설치 root는 서버 설정에서 가져오고 요청 경로에서 유도하지 않습니다.
- authorization과 canonicalization은 한 번 수행한 동일한 표현을 이후 단계에서도 사용합니다.
- built-in server의 down 상태가 보안 경계를 약화시키지 않게 합니다.

