# Proxy Panic

**Category:** Web / RCE  
**Difficulty:** Silver 후반 ~ Gold 초입  
**Points:** 350

문서 미리보기 팀이 built-in office server를 업그레이드했습니다. 아직 helper가 정상적으로 뜨지 않지만, 프록시가 자동 복구를 시도한다고 합니다.

웹 서버 프로세스의 flag를 찾으세요.

```text
URL: http://<challenge-host>:<port>
Flag format: flag{...}
```

브루트포싱, 서비스 거부, 외부 callback 서버는 필요하지 않습니다. 문제 인스턴스 밖의 시스템을 대상으로 같은 기법을 시도하지 마십시오.

