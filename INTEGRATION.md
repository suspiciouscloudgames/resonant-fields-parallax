# 조호연 / 외부 작품 / GPT 연동 시작점

이 문서를 먼저 읽으세요. 외부 작품이 구독할 신호는 **`message.read`**입니다.
이 기능은 **v0.3.16-weekly-messages 이상**의 실행 중인 전시 PC 서버에서 제공됩니다.
GitHub 자체가 신호를 전송하는 것은 아닙니다. 수신 프로그램이 전시 PC에 연결해야 합니다.

## 라즈베리파이에서 받는 주소 (조호연 님)

`http://PC주소:포트/phone.html?key=페어링키`는 **PC가 제공하고 폰에서 여는 화면 주소**입니다. 폰 자체의 IP 주소가 아닙니다. 라즈베리파이는 폰을 거치지 않고 **전시 PC**의 이벤트 API를 구독합니다.

| 용도 | 경로 |
| --- | --- |
| 폰 화면 | `/phone.html?key=PAIRING_KEY` |
| 연결 확인 | `/api/info?key=PAIRING_KEY` |
| 신호 수신 (SSE) | `/api/events/stream?key=PAIRING_KEY&after=LAST_EVENT_ID` |
| 신호 수신 (HTTP 폴링) | `/api/events?key=PAIRING_KEY&after=LAST_EVENT_ID` |

모두 PHONE 주소와 같은 PC 호스트·포트·페어링키를 사용합니다. 실제 주소와 키는 운영자에게 별도로 전달받으세요. Wi-Fi 변경으로 PC의 IP가 바뀌면 실제 PHONE 주소를 기준으로 수정합니다.

라즈베리파이 터미널에서 아래처럼 연결을 진단할 수 있습니다. Python 3와 curl을 사용합니다. 첫 실행은 현재 커서부터 시작해 과거 신호를 재생하지 않습니다.

```bash
read -r -p 'PC 기본 주소 (예: http://192.168.1.219:8770): ' PC_BASE
read -r -s -p '페어링키: ' PAIRING_KEY
printf '\n'
curl --fail --connect-timeout 5 "$PC_BASE/api/info?key=$PAIRING_KEY"
LAST_EVENT_ID=$(curl --fail --connect-timeout 5 "$PC_BASE/api/events?key=$PAIRING_KEY" | python3 -c 'import sys,json; print(json.load(sys.stdin)["latestCursor"])')
curl --fail --no-buffer --connect-timeout 5 "$PC_BASE/api/events/stream?key=$PAIRING_KEY&after=$LAST_EVENT_ID"
```

SSE의 `data:` JSON에서 **`type == "message.read"`**인 경우만 장치를 동작시키세요. `payload.scene.index + 1`이 씬 번호이며 `payload.scene.instance`가 회차까지 구분하는 씬 식별자입니다.

서버는 SSE의 `event: message.read` 필드를 보내지 않습니다. 브라우저 EventSource에서는 `onmessage`로 받은 JSON의 `type`을 검사해야 합니다. Python에서도 `data:`를 JSON으로 해석하고 같은 필터를 적용합니다.

위 curl 명령은 진단용입니다. 실제 수신 프로그램은 마지막 처리 완료 `id`를 파일에 영속 저장하고, 끊기면 해당 커서로 재접속하며, 재전송된 이벤트로 장치를 중복 실행하지 않도록 해야 합니다. `: connected`와 `: heartbeat`는 신호가 아닌 연결 유지용 주석입니다. 같은 공용 Wi-Fi여도 기기 간 통신이 차단되면 접속할 수 없습니다. 연결 시간 초과는 네트워크·PC 실행·방화벽을, HTTP 403은 페어링키를 확인합니다.

## 씬당 한 번의 의미

- 현재 씬에서 도착한 문자의 **대화 본문이 처음 열렸을 때** 한 번 발생합니다.
- 해당 대화가 이미 열려 있다면, 현재 씬의 첫 문자가 도착해 표시될 때 발생합니다.
- 같은 씬에서 닫았다 다시 열기, 추가 문자 수신, 답장, 모바일 새로고침은 추가 신호를 만들지 않습니다.
- 알림만 보기, 대화 목록만 보기, 이전 씬의 문자나 사전 대화 보기에는 발생하지 않습니다.
- 관객이 문자를 확인하지 않은 씬에서는 발생하지 않습니다. 읽기를 끝냈는지 판단하는 기능은 아닙니다.
- 다음 루프는 새로운 `scene.instance`이므로 각 씬에서 다시 한 번 발생할 수 있습니다.
- 서버가 이벤트를 한 번만 생성해 SQLite에 저장합니다. 재접속 시 재전송은 가능하므로 수신측도 `event.id` 또는 `payload.scene.instance`로 중복 실행을 막아야 합니다.

## 연결

PC와 수신 컴퓨터는 서로 통신 가능한 같은 LAN에 연결합니다. PC 방화벽에서 해당 포트 접근이 허용되어야 합니다.
전시 실행 시 나오는 PHONE 주소가 `http://PC_IP:8770/phone.html?key=PAIRING_KEY`라면 아래 주소를 사용합니다.
실제 키는 운영자에게 전달받고 공개 저장소에 올리지 마세요. 포트는 실제 PHONE 주소를 따릅니다.

- SSE: `http://PC_IP:8770/api/events/stream?key=PAIRING_KEY&after=LAST_EVENT_ID`
- HTTP 폴링: `http://PC_IP:8770/api/events?key=PAIRING_KEY&after=LAST_EVENT_ID`
- JSON 계약과 예시: [integration/event-contract.json](integration/event-contract.json)
- 브라우저 SSE 도우미: [dist/exhibition-events.js](dist/exhibition-events.js)
- 서버 발생 지점: [exhibition_server.py](exhibition_server.py)의 `read_conversation`
- 중복 방지/저장: [exhibition_store.py](exhibition_store.py)의 `emit`
- HTTP 검증: [tests/conversations-server.py](tests/conversations-server.py)

```javascript
// exhibition-events.js를 먼저 로드. savedCursor는 수신 프로그램에서 영속 저장한 값.
const stream = ExhibitionEvents.subscribe({
  url: 'http://PC_IP:8770', key: 'PAIRING_KEY', after: savedCursor,
  onEvent(event) {
    if (event.type === 'message.read') {
      // event.id를 중복 방지 키로 사용하여 외부 작품의 동작을 한 번 실행.
      // payload.scene.index는 0부터 시작하고 instance는 해당 회차 씬의 고유 식별자.
      handleReadOnce(event.id, event.payload.scene.instance, event.payload.scene.index + 1);
    }
    // 다른 종류의 이벤트도 커서를 갱신. 처리가 성공한 후 영속 저장.
    saveCursor(event.id);
  }
});
```

위의 `handleReadOnce`, `saveCursor`, `savedCursor`는 수신측에서 구현할 부분입니다.
예제 콜백은 동기 처리를 가정합니다. 비동기 장치 제어는 큐에 넣고 성공한 순서대로 커서를 저장하세요.
처음 연결할 때 과거 동작을 재실행하지 않으려면 `/api/events`의 `latestCursor`를 읽어 최초 `after`로 사용하세요.
이후 연결부터는 저장한 커서로 재접속하여 중간에 끊긴 이벤트를 복구합니다.
과거 이벤트 전체가 필요한 테스트에서만 `after=0`을 사용하세요.

다른 출처의 웹 페이지에서 구독하면 전시 실행 옵션 `--event-origin https://정확한-수신페이지-origin`이 필요합니다.
HTTPS 페이지에서 HTTP LAN 서버 연결은 브라우저 정책에 막힐 수 있습니다. 현장에서는 수신측 서버 프로세스에서 HTTP/SSE로 연결하는 방식도 사용할 수 있습니다.
휴대폰 페어링 키 외 별도 외부 작품 주소는 설정되어 있지 않습니다. 서버가 먼저 외부 장치로 푸시하는 웹훅 방식은 아닙니다.

## 씬 순서

| 번호 | scene.id | 내용 |
| --- | --- | --- |
| 1 | smoking | 흡연 |
| 2 | rain | 비 |
| 3 | youtube | 유튜브 |
| 4 | police | 경찰차 |
| 5 | game | 보석 게임 |
| 6 | dog | 들개 / 이전 거주자의 문자 |

`message.received`는 문자마다 발생하고 `phone.screen.changed`는 화면 조작마다 발생하므로 씬당 신호로 쓰지 마세요.
`occurredAt`과 `receivedAt`은 실제 시간이며, `displayAt`은 메시지 UI에 보이는 이야기 속 날짜입니다.
사전 대화와 1~5씬은 서로 다른 요일의 과거 날짜로 표시하며, 같은 씬의 문자는 같은 날 오후 1~4시 사이로 묶습니다. 마지막 씬은 실제 도착 날짜와 시각입니다.

각본상 본인 발신은 `message.replied` + `payload.message.scripted=true`입니다. 수신 신호로 사용하지 마세요. 새 원고와 시간표는 [MESSAGE-TIMING.md](MESSAGE-TIMING.md)를 참고하세요.
