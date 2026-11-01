# Unintended-solve Checklist

- 홈, JS, source map, health, 정상 status 응답에 flag가 직접 노출되지 않는가
- `/diagnostics/bootstrap/<id>`가 12자리 임의 request id 없이는 열리지 않는가
- directory traversal로 container 파일을 직접 읽을 수 없는가
- request body, Host, method 변경만으로 flag가 나오지 않는가
- bootstrap trace가 512 bytes로 제한되고 60초 뒤 만료되는가
- command timeout과 response size가 제한되는가
- 컨테이너가 non-root이며 host mount/socket/capability가 없는가
- 문제 포트가 localhost에만 bind되는가

의도 풀이 자체가 컨테이너 내부 shell 실행이므로 임의 명령 실행은 취약점의 일부입니다. Docker 경계 탈출 가능성을 의미하지 않으며, 운영 환경에서 privileged 권한이나 host 자원을 추가하면 안 됩니다.

